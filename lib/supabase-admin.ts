// ============================================================
// lib/supabase-admin.ts — leniwy singleton service_role klienta
//
// Dlaczego lazy: Next.js podczas "next build" statycznie analizuje
// każdą route.ts (page data collection). Jeśli createClient() jest
// wywołany na poziomie modułu, wykonuje się PRZY BUDOWANIU, zanim
// env vary są dostępne (np. preview bez ustawionych sekretów) —
// build pada z "supabaseUrl is required" mimo że w runtime wszystko
// byłoby ustawione. Leniwa inicjalizacja odracza tworzenie klienta
// do pierwszego realnego wywołania w handlerze.
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nie ustawione. Sprawdź zmienne środowiskowe projektu."
    );
  }

  client = createClient(url, key);
  return client;
}
