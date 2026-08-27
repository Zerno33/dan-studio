import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

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

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, is_admin, is_banned, consent_at")
    .eq("id", user.id)
    .single();

  const profilePatch: Record<string, unknown> = {};
  if (user.email && profile?.email !== user.email) profilePatch.email = user.email;
  if (makeAdmin && !profile?.is_admin) profilePatch.is_admin = true;
  if (!profile?.consent_at) profilePatch.consent_at = new Date().toISOString();

  if (Object.keys(profilePatch).length) {
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

  const isAdmin = makeAdmin || !!profile?.is_admin || !!profilePatch.is_admin;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? profile?.email,
      isAdmin,
      isBanned: !!profile?.is_banned,
      consentAt: profilePatch.consent_at ?? profile?.consent_at ?? null,
    },
    credits: credits?.balance ?? 0,
    planType: credits?.plan_type ?? null,
  });
}
