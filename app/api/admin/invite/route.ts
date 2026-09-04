import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";
import { accrueTeacherCommissionFromGrant } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const amount = Number(body.credits);
  const credits = Number.isFinite(amount) && amount >= 0 ? amount : 50;
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Podaj email." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origin ? `${origin}/login` : undefined,
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message || "Nie wysłano zaproszenia." }, { status: 400 });
  }

  const userId = data.user.id;
  await supabaseAdmin.from("profiles").upsert({
    id: userId,
    email,
    consent_at: new Date().toISOString(),
  });
  const { data: current } = await supabaseAdmin.from("credits").select("balance").eq("user_id", userId).single();
  const newBalance = (current?.balance ?? 0) + credits;
  await supabaseAdmin.from("credits").upsert({ user_id: userId, balance: newBalance });
  if (credits > 0) {
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      delta: credits,
      reason: "admin_grant",
    });
    await accrueTeacherCommissionFromGrant(supabaseAdmin, userId, credits);
  }

  return NextResponse.json({ ok: true, userId, email });
}
