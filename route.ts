import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { id } = await params;

  const { amount } = await req.json();
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount musi być liczbą." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: current } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", id)
    .single();

  const newBalance = (current?.balance ?? 0) + amount;

  await supabaseAdmin
    .from("credits")
    .upsert({ user_id: id, balance: newBalance });

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: id,
    delta: amount,
    reason: "admin_grant",
  });

  return NextResponse.json({ balance: newBalance });
}
