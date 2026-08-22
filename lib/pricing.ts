// ============================================================
// lib/pricing.ts — mapa cen modeli, USD za 1M tokenów
// Pokrywa: MYS-39
//
// UWAGA WDROŻENIOWA (przeniesione z litellm_config.yaml):
// Nazwy modeli "gpt-5.6-luna" / "gpt-5.6-terra" / "grok-4.3" / "grok-4.6"
// to nazwy robocze z configu — przed produkcją ZWERYFIKOWAĆ dokładne
// nazwy i ceny w cenniku OpenAI (openai.com/api/pricing) i x.ai.
// Ceny poniżej są WARTOŚCIAMI PLACEHOLDER na bazie klasy flagowej
// modeli ($1.25/M in, $10/M out) — NIE są zweryfikowanym faktem.
//
// Przy zmianie cennika providera: podmienić stałe tutaj. Historia
// w credit_transactions.cost_usd NIE przelicza się wstecz — zapisany
// koszt odzwierciedla cenę faktycznie zapłaconą w momencie transakcji.
// ============================================================

interface ModelPricing {
  inputPerM: number;      // USD / 1M tokenów input (bez cache)
  outputPerM: number;     // USD / 1M tokenów output
  cachedInputPerM: number; // USD / 1M tokenów input z cache (zwykle ~10% inputPerM)
}

export const PRICING: Record<string, ModelPricing> = {
  "gpt-5.6-luna": { inputPerM: 1.25, outputPerM: 10.0, cachedInputPerM: 0.125 },
  "gpt-5.6-terra": { inputPerM: 1.25, outputPerM: 10.0, cachedInputPerM: 0.125 },
  "grok-4.3": { inputPerM: 1.25, outputPerM: 10.0, cachedInputPerM: 0.125 },
  "grok-4.6": { inputPerM: 1.25, outputPerM: 10.0, cachedInputPerM: 0.125 },
};

const FALLBACK_PRICING: ModelPricing = {
  inputPerM: 1.25,
  outputPerM: 10.0,
  cachedInputPerM: 0.125,
};

export function calculateCostUsd(
  model: string,
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number }
): number {
  const p = PRICING[model] ?? FALLBACK_PRICING;

  const uncachedPromptTokens = Math.max(0, usage.promptTokens - usage.cachedTokens);

  const inputCost = (uncachedPromptTokens / 1_000_000) * p.inputPerM;
  const cachedCost = (usage.cachedTokens / 1_000_000) * p.cachedInputPerM;
  const outputCost = (usage.completionTokens / 1_000_000) * p.outputPerM;

  return Number((inputCost + cachedCost + outputCost).toFixed(6));
}
