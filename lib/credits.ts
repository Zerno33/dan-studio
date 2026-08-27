export const LENGTH_MULTIPLIER: Record<string, number> = {
  short: 1,
  std: 1.5,
  long: 2,
};

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

export function calculateCreditCost(body: GenerateCostInput, creditsPerBlock: number): number {
  const blockCount = expectedBlockCount(body);
  const lengthMult =
    body.systemSlug === "r1" ? 1 : LENGTH_MULTIPLIER[body.lengthMode ?? "std"] ?? 1.5;
  return Math.ceil(blockCount * creditsPerBlock * lengthMult);
}
