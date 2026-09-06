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
        const local =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
        throw new Error(
          local
            ? "Lokalnie brak kluczy Supabase (.env.local to pusta kopia example). W terminalu: npx vercel env pull .env.local — potem npm.cmd run dev. Albo testuj na preview Vercel."
            : "Logowanie niedostępne. Odśwież stronę. Jeśli wraca — daj znać adminowi."
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
