import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_banned, created_at, referral_code, referred_by, credits(balance, plan_type)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}
