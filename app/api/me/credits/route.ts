import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REASON_OK = new Set(["generation", "generation_failed", "starter", "admin_grant", "mor_topup"]);

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: rows, error } = await supabaseAdmin
    .from("credit_transactions")
    .select("id, created_at, delta, reason, model, system_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  let list = rows;
  if (error) {
    const fallback = await supabaseAdmin
      .from("credit_transactions")
      .select("created_at, delta, reason, model, system_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    list = (fallback.data || []).map((r, i) => ({ ...r, id: `${r.created_at}-${i}` }));
  }

  const systemIds = [...new Set((list || []).map((r) => r.system_id).filter(Boolean))] as string[];
  const slugById = new Map<string, string>();
  if (systemIds.length) {
    const { data: systems } = await supabaseAdmin.from("systems").select("id, slug").in("id", systemIds);
    for (const s of systems || []) slugById.set(s.id, s.slug);
  }

  const ledger = (list || [])
    .filter((r) => REASON_OK.has(r.reason || ""))
    .map((r) => ({
      id: r.id,
      at: r.created_at,
      delta: Number(r.delta) || 0,
      reason: r.reason as string,
      systemSlug: r.system_id ? slugById.get(r.system_id) || null : null,
      model: r.model || null,
    }));

  return NextResponse.json({ ledger });
}
