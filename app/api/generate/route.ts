// ============================================================
// app/api/generate/route.ts — PROMPT_ENGINE
// Pokrywa: MYS-16, MYS-17, MYS-18, MYS-36, MYS-37, MYS-38, MYS-39, MYS-45
//
// Zmiany vs poprzednia wersja (audyt 2026-08-20):
// - MYS-36: whitelist modelOverride — user nie wskaże dowolnego modelu
// - MYS-37: reserve_credits/refund_credits RPC zamiast read-modify-write
// - MYS-38: cost liczony z mnożnikiem lengthMode, nie tylko blockCount
// - MYS-39: log tokenów + cost_usd do credit_transactions
// - MYS-45: zapis wygenerowanych bloków do public.prompts
//
// Flow:
// 1. Auth + pobranie rekordu systemu (service_role — jedyne miejsce,
//    które czyta system_prompt)
// 2. Walidacja wejścia + whitelist modelu (MYS-36)
// 3. Rezerwacja kredytów PRZED callem, atomowo (MYS-37)
// 4. Moderacja wejścia (placeholder — bez zmian, poza zakresem audytu)
// 5. Kompozycja requestu → LiteLLM → model
// 6. Parsowanie <<<BLOCK>>> na tablicę {prompt, negative}
// 7. Sukces: log kosztu + zapis do prompts + response
//    Błąd modelu: refund_credits, response błędu
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateCostUsd } from "@/lib/pricing";
import { checkRateLimit, validateImages, type GuardResult } from "@/lib/rate-limit";
import { ALLOWED_MODEL_SET } from "@/lib/models";
import { calculateCreditCost, expectedBlockCount } from "@/lib/credits";
import { chatCompletions, userFacingLlmError } from "@/lib/llm";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


// ---------- typy ----------
interface GenerateRequest {
  systemSlug: "n1" | "s1" | "r1";
  mode?: "img" | "prompt";
  images?: { base64: string; mime: string }[];
  pastedPrompt?: string;
  brief?: string;
  variant?: string;
  count?: number;
  lengthMode?: "short" | "std" | "long";
  modelOverride?: string;
  formatMode?: "together" | "separate"; // MYS-45: było tylko na froncie
}

interface PromptBlock {
  prompt: string;
  negative: string;
}

const LENGTH_LABELS: Record<string, string> = {
  short: "110–200",
  std: "300–420",
  long: "420–520",
};

const OUTPUT_CONTRACT = `

FORMAT ODPOWIEDZI — OBOWIĄZKOWY
Zwracasz wyłącznie bloki, bez wstępu, bez komentarza, bez podsumowania.
<<<BLOCK>>>
PROMPT: [treść po angielsku]
NEGATIVE: [treść po angielsku lub "-" jeśli instrukcja systemu nie przewiduje]
<<<END>>>
Jeden obraz/wariant = jeden blok.`;

// ---------- parsowanie bloków ----------
function parseBlocks(raw: string): PromptBlock[] {
  const out: PromptBlock[] = [];
  const re = /<<<BLOCK>>>([\s\S]*?)<<<END>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const body = m[1].trim();
    const idx = body.search(/NEGATIVE\s*:/i);
    let prompt = body,
      negative = "";
    if (idx > -1) {
      prompt = body.slice(0, idx);
      negative = body.slice(idx).replace(/^NEGATIVE\s*:/i, "").trim();
    }
    prompt = prompt.replace(/^PROMPT\s*:/i, "").trim();
    if (prompt) out.push({ prompt, negative: negative === "-" ? "" : negative });
  }
  if (!out.length && raw.trim()) out.push({ prompt: raw.trim(), negative: "" });
  return out;
}

// ---------- walidacja wejścia per system ----------
function validateInput(body: GenerateRequest): { ok: true } | { ok: false; error: string } {
  if (body.systemSlug === "n1") {
    if (body.mode === "img" && (!body.images || body.images.length === 0)) {
      return { ok: false, error: "Wrzuć minimum jedną inspirację." };
    }
    if (body.mode === "img" && body.images!.length > 10) {
      return { ok: false, error: "Maksymalnie 10 obrazów." };
    }
    if (body.mode === "prompt" && !body.pastedPrompt?.trim()) {
      return { ok: false, error: "Wklej prompt do neutralizacji." };
    }
  }
  if (body.systemSlug === "r1") {
    if (!body.images || body.images.length !== 1) {
      return { ok: false, error: "R1 wymaga dokładnie jednego zdjęcia bazowego." };
    }
    if (body.count && (body.count < 1 || body.count > 10)) {
      return { ok: false, error: "Liczba wariantów: 1-10." };
    }
  }
  if (body.systemSlug === "s1") {
    if (!body.images?.length && !body.brief?.trim()) {
      return { ok: false, error: "S1 potrzebuje obrazu albo briefu." };
    }
  }
  // MYS-36: whitelist modelu — walidacja wejścia, nie tylko dobór modelu
  if (body.modelOverride && !ALLOWED_MODEL_SET.has(body.modelOverride)) {
    return { ok: false, error: "Niedozwolony model." };
  }
  return { ok: true };
}

function guardMessage(result: GuardResult): string | null {
  return result.ok === false ? result.error : null;
}

// ---------- główny handler ----------
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  // 1. auth
  const authHeader = req.headers.get("authorization");
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(
    authHeader?.replace("Bearer ", "")
  );
  if (authError || !userData?.user) {
    return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_banned, consent_at")
    .eq("id", userId)
    .single();
  if (profile?.is_banned) {
    return NextResponse.json({ error: "Konto zablokowane." }, { status: 403 });
  }
  if (!profile?.consent_at) {
    return NextResponse.json({ error: "Wymagana akceptacja regulaminu." }, { status: 403 });
  }

  const body: GenerateRequest = await req.json();

  // 2. walidacja wejścia (obejmuje whitelist modelu — MYS-36)
  const validation = validateInput(body);
  const validationMsg = guardMessage(validation);
  if (validationMsg) {
    return NextResponse.json({ error: validationMsg }, { status: 400 });
  }

  // MYS-40: rozmiar/typ obrazów PRZED jakąkolwiek kosztowną operacją
  const imgMsg = guardMessage(validateImages(body.images));
  if (imgMsg) {
    return NextResponse.json({ error: imgMsg }, { status: 413 });
  }

  // MYS-40: rate limit per user
  const rateMsg = guardMessage(await checkRateLimit(supabaseAdmin, userId));
  if (rateMsg) {
    return NextResponse.json({ error: rateMsg }, { status: 429 });
  }

  const { data: system, error: sysError } = await supabaseAdmin
    .from("systems")
    .select("id, model, system_prompt, max_words, credits_per_block, version, is_active")
    .eq("slug", body.systemSlug)
    .single();

  if (sysError || !system || !system.is_active) {
    return NextResponse.json({ error: "System niedostępny." }, { status: 404 });
  }

  const modelToUse = body.modelOverride || system.model;
  if (!ALLOWED_MODEL_SET.has(modelToUse)) {
    return NextResponse.json({ error: "Niedozwolony model." }, { status: 400 });
  }

  // 3. koszt z mnożnikiem długości (MYS-38) + rezerwacja atomowa (MYS-37)
  const blockCount = expectedBlockCount(body);
  const cost = calculateCreditCost(body, system.credits_per_block);

  let balanceAfterReserve: number;
  try {
    const { data: newBalance, error: reserveError } = await supabaseAdmin.rpc(
      "reserve_credits",
      { p_user: userId, p_cost: cost }
    );
    if (reserveError) throw reserveError;
    balanceAfterReserve = newBalance as number;
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (msg.includes("INSUFFICIENT_CREDITS")) {
      return NextResponse.json(
        { error: `Brak kredytów. Operacja kosztuje ${cost}.` },
        { status: 402 }
      );
    }
    console.error("Reserve credits error:", msg);
    return NextResponse.json({ error: "Błąd rezerwacji kredytów." }, { status: 500 });
  }

  // 4. moderacja wejścia — placeholder, poza zakresem audytu (patrz MYS-30/7.2)

  // 5. kompozycja promptu
  const lengthTxt =
    body.systemSlug === "r1"
      ? "\n\nDługość każdej edycji: maksymalnie 2 zdania."
      : `\n\nDocelowa długość promptu: ${LENGTH_LABELS[body.lengthMode ?? "std"]} słów. Gęstość informacji, nie słów.`;

  const systemPrompt = system.system_prompt + lengthTxt + OUTPUT_CONTRACT;

  const content: any[] = [];
  if (body.systemSlug === "n1" && body.mode === "prompt") {
    content.push({ type: "text", text: `TRYB B — PROMPT DO NEUTRALIZACJI:\n\n${body.pastedPrompt}` });
  } else {
    (body.images ?? []).forEach((img, i) => {
      content.push({
        type: "text",
        text:
          body.systemSlug === "r1"
            ? "ZDJĘCIE BAZOWE:"
            : `INSPIRACJA ${i + 1} — osobny prompt, nie łącz ze scenami z pozostałych obrazów:`,
      });
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mime};base64,${img.base64}`, detail: "low" },
      });
    });
  }

  let cmdLine = "";
  if (body.systemSlug === "r1") {
    const noMultiply = body.variant === "analyze" || body.variant === "repair";
    cmdLine = `KOMENDA: R1 ${body.variant}${noMultiply ? "" : ` x${body.count ?? 4}`} — zwróć ${blockCount} blok(ów).\n`;
  }
  if (body.systemSlug === "n1" && body.mode === "img") {
    cmdLine = `KOMENDA: N1 batch — zwróć dokładnie ${blockCount} blok(ów), po jednym na obraz, w kolejności.\n`;
  }
  content.push({ type: "text", text: `${cmdLine}BRIEF: ${body.brief?.trim() || "(brak — pracuj na wejściu)"}` });

  // 6. wywołanie modelu (LiteLLM albo direct OpenAI/xAI — MYS-13)
  let raw: string;
  let usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } = {};

  try {
    const llm = await chatCompletions({
      model: modelToUse,
      maxTokens: body.systemSlug === "r1" ? 800 : 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    });
    raw = llm.content;
    usage = llm.usage;
  } catch (e) {
    console.error("Generate error:", e instanceof Error ? e.message : "unknown");
    await supabaseAdmin.rpc("refund_credits", { p_user: userId, p_amount: cost });
    return NextResponse.json({ error: userFacingLlmError(e) }, { status: 502 });
  }

  const blocks = parseBlocks(raw);
  if (!blocks.length) {
    await supabaseAdmin.rpc("refund_credits", { p_user: userId, p_amount: cost });
    return NextResponse.json({ error: "Pusty output. Powtórz." }, { status: 502 });
  }

  // 7a. MYS-39: policz koszt USD i zapisz transakcję z detalami tokenów
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const costUsd = calculateCostUsd(modelToUse, {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    cachedTokens,
  });

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    delta: -cost,
    reason: "generation",
    system_id: system.id,
    blocks_count: blocks.length,
    prompt_tokens: usage.prompt_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? null,
    cached_tokens: cachedTokens || null,
    model: modelToUse,
    cost_usd: costUsd,
  });

  // 7b. MYS-45: zapis wygenerowanych bloków do biblioteki
  const { data: savedPrompts } = await supabaseAdmin
    .from("prompts")
    .insert(
      blocks.map((b) => ({
        user_id: userId,
        system_id: system.id,
        system_version: system.version,
        prompt: b.prompt,
        negative: b.negative,
        format_mode: body.formatMode ?? "together",
        word_count: b.prompt.trim().split(/\s+/).length,
        folder_id: null,
      }))
    )
    .select("id");

  return NextResponse.json({
    blocks: blocks.map((b, i) => ({ ...b, id: savedPrompts?.[i]?.id ?? null })),
    creditsRemaining: balanceAfterReserve,
    systemVersion: system.version,
    usage, // debug kosztu w fazie kalibracji (MYS-34)
  });
}
