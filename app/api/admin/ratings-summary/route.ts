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
    .from("ratings")
    .select("system_id, system_version, verdict, tags, systems(label)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: Record<
    string,
    { total: number; pass: number; tags: Record<string, number> }
  > = {};

  for (const r of data as any[]) {
    const key = `${r.systems?.label ?? r.system_id} v${r.system_version}`;
    if (!summary[key]) summary[key] = { total: 0, pass: 0, tags: {} };
    summary[key].total++;
    if (r.verdict === "pass") summary[key].pass++;
    for (const tag of r.tags ?? []) {
      summary[key].tags[tag] = (summary[key].tags[tag] ?? 0) + 1;
    }
  }

  return NextResponse.json({ summary });
}
