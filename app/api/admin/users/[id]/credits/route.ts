import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";
import { findTeacherByCode } from "@/lib/referral";
import { packUsdFromCredits, teacherCommissionUsd } from "@/lib/packs";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { id } = await params;

  const { amount } = await req.json();
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount musi być liczbą." }, { status: 400 });
  }

  const delta = Math.trunc(amount);
  const supabaseAdmin = getSupabaseAdmin();
  const { data: current } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", id)
    .single();

  const newBalance = (current?.balance ?? 0) + delta;

  await supabaseAdmin
    .from("credits")
    .upsert({ user_id: id, balance: newBalance });

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: id,
    delta,
    reason: "admin_grant",
  });

  const packUsd = packUsdFromCredits(delta);
  if (packUsd != null) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("referred_by")
      .eq("id", id)
      .maybeSingle();
    const code = profile?.referred_by;
    if (code) {
      const teacher = await findTeacherByCode(supabaseAdmin, String(code));
      if (teacher && teacher.id !== id) {
        const add = teacherCommissionUsd(packUsd);
        const { data: existing } = await supabaseAdmin
          .from("referrals")
          .select("commission_accrued")
          .eq("user_id", id)
          .maybeSingle();
        const next = Number(existing?.commission_accrued || 0) + add;
        await supabaseAdmin.from("referrals").upsert(
          {
            teacher_id: teacher.id,
            user_id: id,
            status: "active",
            commission_accrued: next,
          },
          { onConflict: "user_id" }
        );
      }
    }
  }

  return NextResponse.json({ balance: newBalance });
}
