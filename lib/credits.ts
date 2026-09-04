import type { AllowedModel } from "@/lib/models";

export const LENGTH_MULTIPLIER: Record<string, number> = {
  short: 1,
  std: 1.5,
  long: 2,
};

/** Kr za 1 blok przy length=std (~50% COGS z kalibracji 19 gen). */
export const MODEL_CREDITS_PER_BLOCK: Record<AllowedModel, number> = {
  "gpt-5.6-luna": 12,
  "grok-4.6": 13,
  "grok-4.3": 11,
  "gpt-5.6-terra": 3,
};

const FALLBACK_CREDITS_PER_BLOCK = 12;

export type GenerateCostInput = {
  systemSlug: "n1" | "s1" | "r1";
  mode?: "img" | "prompt";
  images?: unknown[];
  variant?: string;
  count?: number;
  lengthMode?: "short" | "std" | "long";
};

export function expectedBlockCount(body: GenerateCostInput): number {
  if (body.systemSlug === "n1") {
    return body.mode === "img" ? Math.max(body.images?.length ?? 1, 1) : 1;
  }
  if (body.systemSlug === "r1") {
    const noMultiply = body.variant === "analyze" || body.variant === "repair";
    return noMultiply ? 1 : Math.max(body.count ?? 4, 1);
  }
  return 1;
}

export function creditsPerBlockForModel(model: string): number {
  return MODEL_CREDITS_PER_BLOCK[model as AllowedModel] ?? FALLBACK_CREDITS_PER_BLOCK;
}

export function calculateCreditCost(body: GenerateCostInput, model: string): number {
  const blockCount = expectedBlockCount(body);
  const perBlock = creditsPerBlockForModel(model);
  const lengthMult =
    body.systemSlug === "r1" ? 1.5 : LENGTH_MULTIPLIER[body.lengthMode ?? "std"] ?? 1.5;
  return Math.max(1, Math.ceil((blockCount * perBlock * lengthMult) / 1.5));
}
