import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function grantAmountFromEvent(payload: any): { userId?: string; email?: string; amount: number } | null {
  const amount = Number(
    payload?.data?.credits ??
      payload?.meta?.custom_data?.credits ??
      payload?.data?.attributes?.first_order_item?.product_id ??
      0
  );
  const userId =
    payload?.data?.user_id ??
    payload?.meta?.custom_data?.user_id ??
    payload?.data?.attributes?.custom_data?.user_id;
  const email =
    payload?.data?.email ??
    payload?.data?.attributes?.user_email ??
    payload?.data?.customer_email;
  if (!userId && !email) return null;
  return { userId, email, amount: Number.isFinite(amount) && amount > 0 ? amount : 100 };
}

export async function POST(req: NextRequest) {
  const secret = process.env.MOR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook nie skonfigurowany." }, { status: 503 });
  }

  const header = req.headers.get("x-webhook-secret") || req.headers.get("authorization") || "";
  if (header.replace("Bearer ", "") !== secret) {
    return NextResponse.json({ error: "Nieautoryzowany webhook." }, { status: 401 });
  }

  const payload = await req.json();
  const grant = grantAmountFromEvent(payload);
  if (!grant) return NextResponse.json({ ok: true, skipped: true });

  const supabaseAdmin = getSupabaseAdmin();
  let userId = grant.userId;
  if (!userId && grant.email) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", grant.email)
      .single();
    userId = profile?.id;
  }
  if (!userId) return NextResponse.json({ ok: true, skipped: true });

  const { data: current } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .single();

  const newBalance = (current?.balance ?? 0) + grant.amount;
  await supabaseAdmin.from("credits").upsert({ user_id: userId, balance: newBalance });
  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    delta: grant.amount,
    reason: "mor_topup",
  });

  return NextResponse.json({ ok: true, balance: newBalance });
}
