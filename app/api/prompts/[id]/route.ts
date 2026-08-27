import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: owned } = await supabaseAdmin
    .from("prompts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!owned) return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("prompts")
    .update({ folder_id: body.folderId ?? null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
