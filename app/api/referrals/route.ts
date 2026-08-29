import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: me } = await supabaseAdmin.from("profiles").select("referral_code").eq("id", user.id).single();
  if (!me?.referral_code) return NextResponse.json({ error: "Brak kodu nauczyciela." }, { status: 403 });

  const { data: rows, error } = await supabaseAdmin
    .from("referrals")
    .select("id, status, commission_accrued, created_at, user_id")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ referrals: [], payoutPending: false, commissionTotal: 0 });
  }

  const ids = (rows || []).map((r) => r.user_id);
  let people: { id: string; email: string | null; is_banned: boolean }[] = [];
  if (ids.length) {
    const got = await supabaseAdmin.from("profiles").select("id, email, is_banned").in("id", ids);
    people = got.data || [];
  }

  const byId = new Map((people || []).map((p) => [p.id, p]));
  const referrals = (rows || []).map((r) => {
    const p = byId.get(r.user_id);
    return {
      id: r.id,
      email: p?.email || "—",
      status: p?.is_banned ? "inactive" : r.status,
      commission: Number(r.commission_accrued || 0),
      created_at: r.created_at,
    };
  });

  const { data: pending } = await supabaseAdmin
    .from("payout_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  const commissionTotal = referrals.reduce((s, r) => s + r.commission, 0);
  const activeCount = referrals.filter((r) => r.status === "active").length;

  return NextResponse.json({
    referrals,
    activeCount,
    commissionTotal,
    payoutPending: Boolean(pending?.id),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: me } = await supabaseAdmin.from("profiles").select("referral_code").eq("id", user.id).single();
  if (!me?.referral_code) return NextResponse.json({ error: "Brak kodu nauczyciela." }, { status: 403 });

  const { data: open } = await supabaseAdmin
    .from("payout_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (open?.id) return NextResponse.json({ error: "Masz już zgłoszenie oczekujące." }, { status: 409 });

  const { error } = await supabaseAdmin.from("payout_requests").insert({ teacher_id: user.id, status: "pending" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
