export const ALLOWED_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "grok-4.3",
  "grok-4.6",
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const ALLOWED_MODEL_SET = new Set<string>(ALLOWED_MODELS);

export function isAllowedModel(model: string): boolean {
  return ALLOWED_MODEL_SET.has(model);
}
