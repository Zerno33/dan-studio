import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("payout_requests")
    .select("id, teacher_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) return NextResponse.json({ payouts: [] });

  const ids = [...new Set((data || []).map((p) => p.teacher_id))];
  const { data: teachers } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, email").in("id", ids)
    : { data: [] as { id: string; email: string | null }[] };
  const byId = new Map((teachers || []).map((t) => [t.id, t.email]));

  return NextResponse.json({
    payouts: (data || []).map((p) => ({
      ...p,
      email: byId.get(p.teacher_id) || "—",
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = body.status === "done" ? "done" : "pending";
  if (!id) return NextResponse.json({ error: "Brak id." }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from("payout_requests").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
