import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Number(searchParams.get("days")) || 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabaseAdmin = getSupabaseAdmin();
  const [dailyRes, byUserRes, txRes] = await Promise.all([
    supabaseAdmin
      .from("admin_cost_daily")
      .select("*")
      .gte("day", since)
      .order("day", { ascending: false }),
    supabaseAdmin
      .from("admin_cost_by_user")
      .select("*")
      .order("total_cost_usd", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("credit_transactions")
      .select("model, cost_usd, delta, reason, created_at")
      .gte("created_at", since)
      .in("reason", ["generation", "generation_failed"]),
  ]);

  if (dailyRes.error) return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  if (byUserRes.error) return NextResponse.json({ error: byUserRes.error.message }, { status: 500 });

  const byModelMap = new Map<
    string,
    { model: string; generations: number; failed: number; creditsSpent: number; costUsd: number }
  >();
  for (const row of txRes.data ?? []) {
    const model = row.model || "(brak)";
    const cur = byModelMap.get(model) || {
      model,
      generations: 0,
      failed: 0,
      creditsSpent: 0,
      costUsd: 0,
    };
    if (row.reason === "generation_failed") cur.failed += 1;
    else {
      cur.generations += 1;
      cur.creditsSpent += Math.abs(Number(row.delta) || 0);
      cur.costUsd += Number(row.cost_usd) || 0;
    }
    byModelMap.set(model, cur);
  }
  const byModel = [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd);

  const totalCostUsd = (dailyRes.data ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  const totalCreditsSpent = (dailyRes.data ?? []).reduce((sum, r) => sum + (r.credits_spent ?? 0), 0);
  const avgCostPerCredit = totalCreditsSpent > 0 ? totalCostUsd / totalCreditsSpent : null;

  const ASSUMED_SELL_PRICE_PER_CREDIT_USD = 0.08;
  const marginWarning =
    avgCostPerCredit !== null && avgCostPerCredit > ASSUMED_SELL_PRICE_PER_CREDIT_USD * 0.4;

  return NextResponse.json({
    daily: dailyRes.data,
    topUsersByCost: byUserRes.data,
    byModel,
    summary: {
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      totalCreditsSpent,
      avgCostPerCreditUsd: avgCostPerCredit !== null ? Number(avgCostPerCredit.toFixed(6)) : null,
      marginWarning,
    },
  });
}
