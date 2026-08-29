import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";
import { normalizeReferralCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = normalizeReferralCode(String(body.code || ""));
  if (!code) return NextResponse.json({ error: "Nieprawidłowy kod." }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("referred_by, referral_code")
    .eq("id", user.id)
    .single();

  if (me?.referred_by) return NextResponse.json({ ok: true, skipped: true });
  if (me?.referral_code && me.referral_code === code) {
    return NextResponse.json({ error: "Nie możesz polecić sam siebie." }, { status: 400 });
  }

  const { data: teacher } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();

  if (!teacher) return NextResponse.json({ error: "Nieznany kod nauczyciela." }, { status: 404 });

  const { error } = await supabaseAdmin.from("profiles").update({ referred_by: code }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
