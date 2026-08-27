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
  let q = supabaseAdmin
    .from("prompts")
    .select("id, prompt, negative, word_count, format_mode, folder_id, system_id, system_version, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (folderId) q = q.eq("folder_id", folderId);
  if (systemId) q = q.eq("system_id", systemId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prompts: data });
}
