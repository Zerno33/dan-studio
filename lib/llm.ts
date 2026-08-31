// MYS-13: LiteLLM jeśli LITELLM_BASE_URL + KEY; inaczej bezpośrednie OpenAI / xAI.

export type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

export type ChatResult = {
  content: string;
  usage: ChatUsage;
};

function openaiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function xaiKey() {
  return process.env.XAI_API_KEY || "";
}

function resolveProviderModel(productModel: string): { url: string; key: string; model: string } {
  const litellmUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, "");
  const litellmKey = process.env.LITELLM_MASTER_KEY;
  if (litellmUrl && litellmKey) {
    return {
      url: `${litellmUrl}/chat/completions`,
      key: litellmKey,
      model: productModel,
    };
  }

  const isGrok = productModel.startsWith("grok-");
  if (isGrok && xaiKey()) {
    const mapped =
      productModel === "grok-4.6"
        ? process.env.XAI_MODEL_46 || "grok-4-latest"
        : process.env.XAI_MODEL_43 || "grok-4-latest";
    return {
      url: "https://api.x.ai/v1/chat/completions",
      key: xaiKey(),
      model: mapped,
    };
  }

  const key = openaiKey();
  if (!key) {
    throw new Error(
      isGrok
        ? "Brak XAI_API_KEY i OPENAI_API_KEY — nie da się wywołać modelu."
        : "Brak OPENAI_API_KEY (i LiteLLM nie jest skonfigurowany)."
    );
  }

  const mapped =
    productModel === "gpt-5.6-terra"
      ? process.env.OPENAI_MODEL_TERRA || process.env.OPENAI_MODEL_LUNA || "gpt-4o"
      : process.env.OPENAI_MODEL_LUNA || "gpt-4o-mini";
  return {
    url: "https://api.openai.com/v1/chat/completions",
    key,
    model: mapped,
  };
}

const OPENAI_FALLBACKS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
const XAI_FALLBACKS = ["grok-4-latest", "grok-3", "grok-2-latest"];

function messagesHaveImages(messages: unknown[]): boolean {
  return JSON.stringify(messages).includes("image_url");
}

export function userFacingLlmError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "unknown";
  if (msg.includes("Brak OPENAI") || msg.includes("Brak XAI")) return msg;
  if (msg === "LLM_GROK_VISION") {
    return "Grok nie przyjął zdjęcia. Na N1 ze zdjęciem wybierz GPT (Luna/Terra).";
  }
  if (msg.startsWith("LLM_HTTP_401") || msg.startsWith("LLM_HTTP_403")) {
    return "Klucz modelu odrzucony. Sprawdź OPENAI_API_KEY / XAI_API_KEY na Vercel.";
  }
  if (msg.startsWith("LLM_HTTP_404") || msg.startsWith("LLM_HTTP_400")) {
    return "Model niedostępny u providera. Ustaw OPENAI_MODEL_LUNA / XAI_MODEL_43 na działającą nazwę.";
  }
  if (msg.startsWith("LLM_HTTP_429")) return "Limit zapytań u providera. Poczekaj chwilę.";
  return "Błąd połączenia z modelem.";
}

async function postChat(
  url: string,
  key: string,
  model: string,
  maxTokens: number,
  messages: unknown[]
): Promise<{ ok: true; data: any } | { ok: false; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

export async function chatCompletions(args: {
  model: string;
  maxTokens: number;
  messages: unknown[];
}): Promise<ChatResult> {
  const target = resolveProviderModel(args.model);
  let result = await postChat(target.url, target.key, target.model, args.maxTokens, args.messages);

  const isOpenAi = target.url.includes("openai.com");
  const isXai = target.url.includes("api.x.ai");
  if (result.ok === false && isOpenAi && (result.status === 400 || result.status === 404)) {
    for (const fb of OPENAI_FALLBACKS) {
      if (fb === target.model) continue;
      console.error("LLM retry model:", fb);
      result = await postChat(target.url, target.key, fb, args.maxTokens, args.messages);
      if (result.ok) break;
    }
  }
  if (result.ok === false && isXai && (result.status === 400 || result.status === 404)) {
    for (const fb of XAI_FALLBACKS) {
      if (fb === target.model) continue;
      console.error("LLM retry xAI model:", fb);
      result = await postChat(target.url, target.key, fb, args.maxTokens, args.messages);
      if (result.ok) break;
    }
    if (result.ok === false && messagesHaveImages(args.messages)) {
      throw new Error("LLM_GROK_VISION");
    }
  }

  if (result.ok === false) {
    console.error("LLM HTTP:", result.status);
    throw new Error(`LLM_HTTP_${result.status}`);
  }

  return {
    content: result.data.choices?.[0]?.message?.content ?? "",
    usage: result.data.usage ?? {},
  };
}
