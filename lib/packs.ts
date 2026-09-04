/** $3–$10 doładowanie: 300 kr / $. 50% marży platformy, 40% z niej dla nauczyciela = 20% wpłaty. */
export const CREDITS_PER_USD = 300;
export const MIN_PACK_USD = 3;
export const MAX_PACK_USD = 10;
export const TARGET_GROSS_MARGIN = 0.5;
export const TEACHER_SHARE_OF_MARGIN = 0.4;
export const TEACHER_SHARE_OF_PAYMENT = TARGET_GROSS_MARGIN * TEACHER_SHARE_OF_MARGIN;
export const SELL_PRICE_PER_CREDIT_USD = 1 / CREDITS_PER_USD;

export function packUsdFromCredits(credits: number): number | null {
  const n = Math.round(Number(credits));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n % CREDITS_PER_USD !== 0) return null;
  const usd = n / CREDITS_PER_USD;
  if (usd < MIN_PACK_USD || usd > MAX_PACK_USD) return null;
  return usd;
}

export function teacherCommissionUsd(packUsd: number): number {
  return Number((packUsd * TEACHER_SHARE_OF_PAYMENT).toFixed(2));
}

export function grossMargin(costUsd: number, creditsSpent: number): number | null {
  const revenue = creditsSpent * SELL_PRICE_PER_CREDIT_USD;
  if (revenue <= 0) return null;
  return 1 - costUsd / revenue;
}
