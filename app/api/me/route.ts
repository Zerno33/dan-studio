import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";
import { normalizeReferralCode, linkReferralRow, findTeacherByCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const STARTER = Math.max(0, Number(process.env.STARTER_CREDITS || 50));

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const email = (user.email || "").toLowerCase();
  const makeAdmin = email && adminEmails().includes(email);

  let profileRes = await supabaseAdmin
    .from("profiles")
    .select("email, is_admin, is_banned, consent_at, referred_by, referral_code, onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (profileRes.error) {
    profileRes = await supabaseAdmin
      .from("profiles")
      .select("email, is_admin, is_banned, consent_at, referred_by, referral_code")
      .eq("id", user.id)
      .single();
  }
  if (profileRes.error && /referr/i.test(profileRes.error.message)) {
    profileRes = await supabaseAdmin
      .from("profiles")
      .select("email, is_admin, is_banned, consent_at")
      .eq("id", user.id)
      .single();
  }
  const profile = profileRes.data as {
    email?: string;
    is_admin?: boolean;
    is_banned?: boolean;
    consent_at?: string | null;
    referred_by?: string | null;
    referral_code?: string | null;
    onboarding_completed_at?: string | null;
  } | null;

  let bootstrapFirstAdmin = false;
  if (!profile?.is_admin && !makeAdmin) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", true);
    bootstrapFirstAdmin = (count ?? 0) === 0;
  }

  const profilePatch: Record<string, unknown> = {};
  if (user.email && profile?.email !== user.email) profilePatch.email = user.email;
  if ((makeAdmin || bootstrapFirstAdmin) && !profile?.is_admin) profilePatch.is_admin = true;
  if (!profile?.consent_at) profilePatch.consent_at = new Date().toISOString();

  if (!profile) {
    await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      is_admin: !!(makeAdmin || bootstrapFirstAdmin),
      consent_at: new Date().toISOString(),
    });
  } else if (Object.keys(profilePatch).length) {
    await supabaseAdmin.from("profiles").update(profilePatch).eq("id", user.id);
  }

  let { data: credits } = await supabaseAdmin
    .from("credits")
    .select("balance, plan_type")
    .eq("user_id", user.id)
    .single();

  if (!credits) {
    await supabaseAdmin.from("credits").upsert({ user_id: user.id, balance: 0 });
    credits = { balance: 0, plan_type: null };
  }

  const { count: starterCount } = await supabaseAdmin
    .from("credit_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("reason", "starter");

  if (STARTER > 0 && (starterCount ?? 0) === 0 && (credits.balance ?? 0) === 0) {
    const newBalance = STARTER;
    await supabaseAdmin.from("credits").upsert({ user_id: user.id, balance: newBalance });
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: user.id,
      delta: STARTER,
      reason: "starter",
    });
    credits = { ...credits, balance: newBalance };
  }

  const isAdmin =
    makeAdmin || bootstrapFirstAdmin || !!profile?.is_admin || !!profilePatch.is_admin;

  const metaCode = normalizeReferralCode(String((user.user_metadata as { referred_by?: string })?.referred_by || ""));
  if (profile && !profile.referred_by && metaCode && metaCode !== profile.referral_code) {
    const teacher = await findTeacherByCode(supabaseAdmin, metaCode);
    if (teacher) {
      await supabaseAdmin.from("profiles").update({ referred_by: metaCode }).eq("id", user.id);
      profile.referred_by = metaCode;
      await linkReferralRow(supabaseAdmin, teacher.id, user.id);
    }
  } else if (profile?.referred_by) {
    const teacher = await findTeacherByCode(supabaseAdmin, profile.referred_by);
    if (teacher && teacher.id !== user.id) {
      await linkReferralRow(supabaseAdmin, teacher.id, user.id);
    }
  }

  let referredCount = 0;
  if (profile?.referral_code) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", profile.referral_code);
    referredCount = count ?? 0;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? profile?.email,
      isAdmin,
      isBanned: !!profile?.is_banned,
      consentAt: profilePatch.consent_at ?? profile?.consent_at ?? null,
      referralCode: profile?.referral_code ?? null,
      referredBy: profile?.referred_by ?? null,
      onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    },
    referredCount,
    credits: credits?.balance ?? 0,
    planType: credits?.plan_type ?? null,
  });
}
