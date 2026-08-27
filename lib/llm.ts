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
  if (isGrok) {
    const key = process.env.XAI_API_KEY;
    if (!key) {
      throw new Error("Brak XAI_API_KEY (i LiteLLM nie jest skonfigurowany).");
    }
    const mapped =
      productModel === "grok-4.6"
        ? process.env.XAI_MODEL_46 || "grok-3"
        : process.env.XAI_MODEL_43 || "grok-3";
    return {
      url: "https://api.x.ai/v1/chat/completions",
      key,
      model: mapped,
    };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Brak OPENAI_API_KEY (i LiteLLM nie jest skonfigurowany).");
  }
  const mapped =
    productModel === "gpt-5.6-terra"
      ? process.env.OPENAI_MODEL_TERRA || "gpt-4o"
      : process.env.OPENAI_MODEL_LUNA || "gpt-4o-mini";
  return {
    url: "https://api.openai.com/v1/chat/completions",
    key,
    model: mapped,
  };
}

export async function chatCompletions(args: {
  model: string;
  maxTokens: number;
  messages: unknown[];
}): Promise<ChatResult> {
  const target = resolveProviderModel(args.model);
  const res = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.key}`,
    },
    body: JSON.stringify({
      model: target.model,
      max_tokens: args.maxTokens,
      messages: args.messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM_HTTP_${res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage ?? {},
  };
}
