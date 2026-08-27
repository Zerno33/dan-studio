import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAID_EVENT_TYPES = new Set([
  "order.created",
  "order.paid",
  "order.updated",
  "checkout.created",
  "checkout.updated",
  "subscription.created",
]);

function secretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function explicitCredits(payload: Record<string, unknown>): number | null {
  const raw =
    (payload?.data as Record<string, unknown> | undefined)?.credits ??
    ((payload?.meta as Record<string, unknown> | undefined)?.custom_data as Record<string, unknown> | undefined)
      ?.credits ??
    ((payload?.data as Record<string, unknown> | undefined)?.attributes as Record<string, unknown> | undefined)
      ?.credits;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.floor(amount);
}

function eventType(payload: Record<string, unknown>): string {
  return String(payload?.type ?? payload?.event ?? "").toLowerCase();
}

function eventId(payload: Record<string, unknown>): string | null {
  const id =
    payload?.id ??
    (payload?.data as Record<string, unknown> | undefined)?.id ??
    (payload?.data as Record<string, unknown> | undefined)?.event_id;
  if (id === undefined || id === null) return null;
  const s = String(id).slice(0, 80);
  return s || null;
}

function grantFromEvent(
  payload: Record<string, unknown>
): { userId?: string; email?: string; amount: number } | { error: string } | { skip: true } {
  const type = eventType(payload);
  if (type && /refund|cancel|dispute|failed|revoked/.test(type)) return { skip: true };
  if (type && !PAID_EVENT_TYPES.has(type)) return { skip: true };

  const amount = explicitCredits(payload);
  if (amount === null) return { error: "Brak kwoty credits w evencie." };

  const data = payload?.data as Record<string, unknown> | undefined;
  const meta = payload?.meta as Record<string, unknown> | undefined;
  const attrs = data?.attributes as Record<string, unknown> | undefined;
  const custom = (meta?.custom_data ?? attrs?.custom_data) as Record<string, unknown> | undefined;

  const userId = (data?.user_id ?? custom?.user_id) as string | undefined;
  const email = (data?.email ?? attrs?.user_email ?? data?.customer_email) as string | undefined;
  if (!userId && !email) return { skip: true };
  return { userId, email, amount };
}

export async function POST(req: NextRequest) {
  const secret = process.env.MOR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook nie skonfigurowany." }, { status: 503 });
  }

  const header = req.headers.get("x-webhook-secret") || req.headers.get("authorization") || "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!secretsEqual(provided, secret)) {
    return NextResponse.json({ error: "Nieautoryzowany webhook." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }

  const grant = grantFromEvent(payload);
  if ("skip" in grant) return NextResponse.json({ ok: true, skipped: true });
  if ("error" in grant) return NextResponse.json({ error: grant.error }, { status: 400 });

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

  const id = eventId(payload);
  const reason = id ? `mor_topup:${id}` : "mor_topup";
  if (id) {
    const { count } = await supabaseAdmin
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("reason", reason);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

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
    reason,
  });

  return NextResponse.json({ ok: true, balance: newBalance });
}
