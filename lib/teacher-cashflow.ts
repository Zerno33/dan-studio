import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePayoutNoteUsd, roundUsd } from "@/lib/payout-note";

export async function teacherCashflow(supabaseAdmin: SupabaseClient) {
  const { data: commRows } = await supabaseAdmin.from("referrals").select("teacher_id, commission_accrued");
  const earned = new Map<string, number>();
  for (const r of commRows || []) {
    earned.set(r.teacher_id, (earned.get(r.teacher_id) || 0) + Number(r.commission_accrued || 0));
  }
  const { data: paidRows } = await supabaseAdmin
    .from("payout_requests")
    .select("teacher_id, note, status")
    .eq("status", "done");
  const paid = new Map<string, number>();
  for (const p of paidRows || []) {
    paid.set(p.teacher_id, (paid.get(p.teacher_id) || 0) + parsePayoutNoteUsd(p.note));
  }
  const owed = new Map<string, number>();
  for (const id of new Set([...earned.keys(), ...paid.keys()])) {
    owed.set(id, roundUsd(Math.max(0, (earned.get(id) || 0) - (paid.get(id) || 0))));
  }
  let owedTotalUsd = 0;
  for (const v of owed.values()) owedTotalUsd += v;
  return { earned, paid, owed, owedTotalUsd: roundUsd(owedTotalUsd) };
}
