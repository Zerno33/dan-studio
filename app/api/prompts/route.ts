import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");
  const systemId = searchParams.get("systemId");

  const supabaseAdmin = getSupabaseAdmin();
  const cols =
    "id, prompt, negative, word_count, format_mode, folder_id, system_id, system_version, created_at, source_preview";
  let q = supabaseAdmin
    .from("prompts")
    .select(cols)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (folderId) q = q.eq("folder_id", folderId);
  if (systemId) q = q.eq("system_id", systemId);

  let { data, error } = await q;
  if (error && String(error.message).includes("source_preview")) {
    let q2 = supabaseAdmin
      .from("prompts")
      .select("id, prompt, negative, word_count, format_mode, folder_id, system_id, system_version, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (folderId) q2 = q2.eq("folder_id", folderId);
    if (systemId) q2 = q2.eq("system_id", systemId);
    const retry = await q2;
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prompts: data });
}
