import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function set(name: string) {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      supabaseUrl: set("SUPABASE_URL") || set("NEXT_PUBLIC_SUPABASE_URL"),
      supabaseService: set("SUPABASE_SERVICE_ROLE_KEY"),
      anonKey: set("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      openai: set("OPENAI_API_KEY"),
      xai: set("XAI_API_KEY"),
      litellm: set("LITELLM_BASE_URL") && set("LITELLM_MASTER_KEY"),
    },
  });
}
