import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_completed_at: now })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, onboardingCompletedAt: now });
}
