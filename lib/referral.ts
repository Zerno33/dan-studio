export function normalizeReferralCode(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 32) return null;
  if (!/^[a-z0-9_-]+$/.test(v)) return null;
  return v;
}
