import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";
import { teacherCashflow } from "@/lib/teacher-cashflow";
import { isMissingNoteColumn } from "@/lib/payout-note";

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
      },
      { onConflict: "user_id", ignoreDuplicates: true }
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
  const extraPeople = (byCode || []).filter((p) => p.id !== user.id && !list.some((r) => r.user_id === p.id));
  const extraIds = extraPeople.map((p) => p.id);
  let extraComm = new Map<string, number>();
  if (extraIds.length) {
    const { data: extraRows } = await supabaseAdmin
      .from("referrals")
      .select("user_id, commission_accrued")
      .in("user_id", extraIds);
    extraComm = new Map((extraRows || []).map((r) => [r.user_id, Number(r.commission_accrued || 0)]));
  }
  const extras = extraPeople.map((p) => ({
    id: p.id,
    email: p.email || "—",
    status: p.is_banned ? "inactive" : "active",
    commission: extraComm.get(p.id) ?? 0,
    created_at: "",
  }));
  const referrals = [...fromRows, ...extras];

  let openRows: { id: string; status?: string; amount?: number | null }[] | null = null;
  const openTry = await supabaseAdmin
    .from("payout_requests")
    .select("id, status, amount")
    .eq("teacher_id", user.id)
    .in("status", ["pending", "in_transit"])
    .limit(1);
  if (openTry.error) {
    const fallback = await supabaseAdmin
      .from("payout_requests")
      .select("id, status")
      .eq("teacher_id", user.id)
      .in("status", ["pending", "in_transit"])
      .limit(1);
    openRows = fallback.data;
  } else {
    openRows = openTry.data;
  }
  const pending = openRows?.[0] || null;

  const { owed } = await teacherCashflow(supabaseAdmin);
  const payoutDueUsd = owed.get(user.id) || 0;

  const commissionTotal = referrals.reduce((s, r) => s + r.commission, 0);
  const activeCount = referrals.filter((r) => r.status === "active").length;

  return NextResponse.json({
    referrals,
    activeCount,
    commissionTotal,
    payoutDueUsd,
    payoutPending: Boolean(pending?.id),
    payoutStatus: pending?.status === "in_transit" ? "in_transit" : pending?.id ? "pending" : null,
    payoutRequestUsd: pending?.amount != null ? Number(pending.amount) : payoutDueUsd,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: me } = await supabaseAdmin.from("profiles").select("referral_code").eq("id", user.id).single();
  if (!me?.referral_code) return NextResponse.json({ error: "Brak kodu nauczyciela." }, { status: 403 });

  const { data: openRows } = await supabaseAdmin
    .from("payout_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .in("status", ["pending", "in_transit"])
    .limit(1);
  if (openRows?.[0]?.id) return NextResponse.json({ error: "Masz już zgłoszenie oczekujące." }, { status: 409 });

  const { owed } = await teacherCashflow(supabaseAdmin);
  const due = owed.get(user.id) || 0;
  if (due <= 0) return NextResponse.json({ error: "Brak prowizji do wypłaty." }, { status: 400 });

  const row = {
    teacher_id: user.id,
    status: "pending" as const,
    amount: due,
    note: `usd:${due.toFixed(2)}`,
  };
  const { error } = await supabaseAdmin.from("payout_requests").insert(row);
  if (error && isMissingNoteColumn(error.message)) {
    const retry = await supabaseAdmin
      .from("payout_requests")
      .insert({ teacher_id: user.id, status: "pending", amount: due });
    if (retry.error) {
      console.error("payout insert:", retry.error.message);
      return NextResponse.json({ error: "Nie udało się zgłosić wypłaty." }, { status: 500 });
    }
  } else if (error) {
    console.error("payout insert:", error.message);
    return NextResponse.json({ error: "Nie udało się zgłosić wypłaty." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, amount: due });
}
