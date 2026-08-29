import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin, isValidSlug } from "@/lib/auth";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


const SYSTEM_COLUMNS =
  "id, slug, label, icon, model, moderation_rule, max_words, credits_per_block, desc_user, inputs_desc, system_prompt, version, is_active, updated_at, created_at";

const META_COLUMNS =
  "id, slug, label, icon, model, moderation_rule, max_words, credits_per_block, desc_user, inputs_desc, version, is_active, updated_at, created_at";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const meta = new URL(req.url).searchParams.get("meta") === "1";
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("systems")
    .select(`${meta ? META_COLUMNS : SYSTEM_COLUMNS}, system_variants(*)`)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ systems: data });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const body = await req.json();

  if (!body.slug || !isValidSlug(body.slug)) {
    return NextResponse.json(
      { error: "Nieprawidłowy slug (dozwolone: a-z, 0-9, -, _, max 32 znaki)." },
      { status: 400 }
    );
  }
  if (!body.label?.trim()) {
    return NextResponse.json({ error: "Label wymagany." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("systems")
    .insert({
      slug: body.slug,
      label: body.label,
      icon: body.icon ?? "○",
      model: body.model ?? "gpt-5.6-luna",
      moderation_rule: body.moderationRule ?? "",
      max_words: body.maxWords ?? 300,
      credits_per_block: body.credits ?? 1,
      desc_user: body.desc ?? "",
      inputs_desc: body.inputs ?? "",
      system_prompt: body.systemPrompt ?? "",
      version: 1,
      is_active: true,
    })
    .select(SYSTEM_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ system: data });
}
