"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient> | null = null;

export async function getSupabaseBrowser(): Promise<SupabaseClient> {
  if (client) return client;
  if (!loading) {
    loading = (async () => {
      const res = await fetch("/api/public-config");
      const cfg = await res.json();
      if (!cfg.configured || !cfg.url || !cfg.anonKey) {
        throw new Error(
          "Logowanie niedostępne. Odśwież stronę. Jeśli wraca — daj znać adminowi."
        );
      }
      client = createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
      });
      return client;
    })();
  }
  return loading;
}
