import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";
import { parsePayoutNoteUsd, parsePayoutStatus, roundUsd, isMissingNoteColumn } from "@/lib/payout-note";
import { teacherCashflow } from "@/lib/teacher-cashflow";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const supabaseAdmin = getSupabaseAdmin();
  let { data, error } = await supabaseAdmin
    .from("payout_requests")
    .select("id, teacher_id, status, created_at, note, amount")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error && isMissingNoteColumn(error.message)) {
    const retry = await supabaseAdmin
      .from("payout_requests")
      .select("id, teacher_id, status, created_at, amount")
      .order("created_at", { ascending: false })
      .limit(80);
    data = (retry.data || []).map((p) => ({ ...p, note: null as string | null }));
    error = retry.error;
  }

  if (error) return NextResponse.json({ payouts: [], cashflow: { owedTotalUsd: 0, pendingCount: 0, inTransitCount: 0 } });

  const { earned, paid, owed, owedTotalUsd } = await teacherCashflow(supabaseAdmin);
  const ids = [...new Set((data || []).map((p) => p.teacher_id))];
  const { data: teachers } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, email, referral_code").in("id", ids)
    : { data: [] as { id: string; email: string | null; referral_code: string | null }[] };
  const byId = new Map((teachers || []).map((t) => [t.id, t]));

  const pendingCount = (data || []).filter((p) => p.status === "pending").length;
  const inTransitCount = (data || []).filter((p) => p.status === "in_transit").length;

  return NextResponse.json({
    cashflow: { owedTotalUsd, pendingCount, inTransitCount },
    payouts: (data || []).map((p) => ({
      ...p,
      email: byId.get(p.teacher_id)?.email || "—",
      referralCode: byId.get(p.teacher_id)?.referral_code || null,
      earnedUsd: roundUsd(earned.get(p.teacher_id) || 0),
      paidUsd: roundUsd(paid.get(p.teacher_id) || 0),
      owedUsd: owed.get(p.teacher_id) || 0,
      requestedUsd: roundUsd(
        parsePayoutNoteUsd((p as { note?: string }).note) || Number((p as { amount?: number }).amount) || 0
      ),
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = parsePayoutStatus(body.status);
  if (!id) return NextResponse.json({ error: "Brak id." }, { status: 400 });
  if (!status) return NextResponse.json({ error: "Status: pending, in_transit albo done." }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: row, error: rowErr } = await supabaseAdmin
    .from("payout_requests")
    .select("id, teacher_id, note")
    .eq("id", id)
    .maybeSingle();
  const rowSafe =
    row ||
    (rowErr && isMissingNoteColumn(rowErr.message)
      ? (
          await supabaseAdmin.from("payout_requests").select("id, teacher_id").eq("id", id).maybeSingle()
        ).data
      : null);
  if (!rowSafe) return NextResponse.json({ error: "Brak zgłoszenia." }, { status: 404 });

  if (status === "done") {
    const { owed } = await teacherCashflow(supabaseAdmin);
    const pay = parsePayoutNoteUsd((rowSafe as { note?: string }).note) || owed.get(rowSafe.teacher_id) || 0;
    const withNote = await supabaseAdmin
      .from("payout_requests")
      .update({ status: "done", note: `paid:${roundUsd(pay)}` })
      .eq("id", id);
    if (withNote.error && isMissingNoteColumn(withNote.error.message)) {
      const { error } = await supabaseAdmin.from("payout_requests").update({ status: "done" }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (withNote.error) {
      return NextResponse.json({ error: withNote.error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabaseAdmin.from("payout_requests").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
