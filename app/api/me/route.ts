import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: profile }, { data: credits }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("email, is_admin, is_banned, consent_at")
      .eq("id", user.id)
      .single(),
    supabaseAdmin.from("credits").select("balance, plan_type").eq("user_id", user.id).single(),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      email: profile?.email ?? user.email,
      isAdmin: !!profile?.is_admin,
      isBanned: !!profile?.is_banned,
      consentAt: profile?.consent_at ?? null,
    },
    credits: credits?.balance ?? 0,
    planType: credits?.plan_type ?? null,
  });
}
