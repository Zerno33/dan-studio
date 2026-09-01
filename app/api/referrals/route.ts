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
    console.error("referrals list:", error.message);
  }

  const { data: byCode } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_banned")
    .eq("referred_by", me.referral_code);

  for (const p of byCode || []) {
    if (p.id === user.id) continue;
    await supabaseAdmin.from("referrals").upsert(
      {
        teacher_id: user.id,
        user_id: p.id,
        status: "active",
        commission_accrued: 0,
      },
      { onConflict: "user_id" }
    );
  }

  const { data: rows2 } = await supabaseAdmin
    .from("referrals")
    .select("id, status, commission_accrued, created_at, user_id")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const list = rows2 || rows || [];
  const ids = [...new Set([...list.map((r) => r.user_id), ...(byCode || []).map((p) => p.id)])];
  let people: { id: string; email: string | null; is_banned: boolean }[] = [];
  if (ids.length) {
    const got = await supabaseAdmin.from("profiles").select("id, email, is_banned").in("id", ids);
    people = got.data || [];
  }

  const byId = new Map((people || []).map((p) => [p.id, p]));
  const fromRows = list.map((r) => {
    const p = byId.get(r.user_id);
    return {
      id: r.id,
      email: p?.email || "—",
      status: p?.is_banned ? "inactive" : r.status,
      commission: Number(r.commission_accrued || 0),
      created_at: r.created_at,
    };
  });
  const extras = (byCode || [])
    .filter((p) => p.id !== user.id && !list.some((r) => r.user_id === p.id))
    .map((p) => ({
      id: p.id,
      email: p.email || "—",
      status: p.is_banned ? "inactive" : "active",
      commission: 0,
      created_at: "",
    }));
  const referrals = [...fromRows, ...extras];

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
