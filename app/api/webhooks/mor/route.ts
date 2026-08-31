import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function firstPositiveInt(...candidates: unknown[]): number | null {
  for (const value of candidates) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

function grantFromEvent(payload: any): {
  userId?: string;
  email?: string;
  amount: number;
  eventId: string | null;
} | null {
  const amount = firstPositiveInt(
    payload?.data?.credits,
    payload?.meta?.custom_data?.credits,
    payload?.data?.attributes?.custom_data?.credits,
    payload?.data?.attributes?.first_order_item?.custom_data?.credits
  );
  const userId =
    payload?.data?.user_id ??
    payload?.meta?.custom_data?.user_id ??
    payload?.data?.attributes?.custom_data?.user_id;
  const email =
    payload?.data?.email ??
    payload?.data?.attributes?.user_email ??
    payload?.data?.customer_email;
  if (amount == null || (!userId && !email)) return null;

  const eventName = payload?.meta?.event_name ?? payload?.event_name;
  const dataId = payload?.data?.id ?? payload?.meta?.event_id ?? payload?.id;
  const orderKey =
    payload?.data?.attributes?.identifier ??
    payload?.data?.attributes?.order_number ??
    payload?.data?.attributes?.created_at;
  const eventId =
    payload?.meta?.webhook_id != null
      ? String(payload.meta.webhook_id)
      : dataId != null
        ? `${eventName ?? "event"}:${dataId}`
        : orderKey != null
          ? `order:${orderKey}:${amount}`
          : null;

  return { userId, email, amount, eventId };
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
  const grant = grantFromEvent(payload);
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

  const { data: newBalance, error } = await supabaseAdmin.rpc("grant_credits", {
    p_user: userId,
    p_amount: grant.amount,
    p_reason: "mor_topup",
    p_event_id: grant.eventId,
  });

  if (error) {
    console.error("MoR grant_credits:", error.message);
    return NextResponse.json({ error: "Nie udało się zapisać kredytów." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance: newBalance });
}
