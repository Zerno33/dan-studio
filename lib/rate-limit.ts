// ============================================================
// lib/rate-limit.ts — MYS-40
// Rate limiting per user na /api/generate + walidacja rozmiaru
// obrazów. Bez zewnętrznego serwisu (Upstash/Redis) na razie —
// licznik oparty o credit_transactions.created_at (generation
// i generation_failed). Jeśli ruch wzrośnie na tyle,
// że zapytanie liczące stanie się kosztowne, przejść na Redis.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_REQUESTS_PER_HOUR = 100;

const MAX_IMAGE_BYTES = 1.2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 3.5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export type GuardResult = { ok: true } | { ok: false; error: string };

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<GuardResult> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [minuteRes, hourRes] = await Promise.all([
    supabase
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("reason", ["generation", "generation_failed"])
      .gte("created_at", oneMinuteAgo),
    supabase
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("reason", ["generation", "generation_failed"])
      .gte("created_at", oneHourAgo),
  ]);

  if ((minuteRes.count ?? 0) >= MAX_REQUESTS_PER_MINUTE) {
    return { ok: false, error: "Zbyt wiele żądań. Poczekaj chwilę." };
  }
  if ((hourRes.count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, error: "Przekroczono limit żądań na godzinę." };
  }
  return { ok: true };
}

// base64 → przybliżony rozmiar w bajtach (bez dekodowania)
function base64ByteSize(b64: string): number {
  const padding = (b64.match(/=+$/) || [""])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function validateImages(
  images: { base64: string; mime: string }[] | undefined
): GuardResult {
  if (!images || images.length === 0) return { ok: true };

  let total = 0;
  for (const img of images) {
    if (!ALLOWED_MIME.has(img.mime)) {
      return { ok: false, error: `Niedozwolony format pliku: ${img.mime}` };
    }
    const size = base64ByteSize(img.base64);
    if (size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Obraz za duży (max ~1.2 MB po kompresji). Wrzucamy mniejszy JPEG." };
    }
    total += size;
  }
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    return { ok: false, error: "Suma zdjęć za duża na jeden strzał (limit Vercel ~4 MB). Daj 5–6 na raz albo mniejsze pliki." };
  }
  return { ok: true };
}
