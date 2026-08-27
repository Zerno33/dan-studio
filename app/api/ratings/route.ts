import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const body = await req.json();
  if (!body.promptId) return NextResponse.json({ error: "promptId wymagane." }, { status: 400 });
  const verdict = body.verdict === "fail" ? "fail" : "pass";
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];

  const supabaseAdmin = getSupabaseAdmin();
  const { data: prompt } = await supabaseAdmin
    .from("prompts")
    .select("id, system_id, system_version, user_id")
    .eq("id", body.promptId)
    .single();

  if (!prompt || prompt.user_id !== user.id) {
    return NextResponse.json({ error: "Prompt nie znaleziony." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("ratings").insert({
    user_id: user.id,
    prompt_id: prompt.id,
    system_id: prompt.system_id,
    system_version: prompt.system_version,
    verdict,
    tags,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
