import { NextRequest, NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS =
  "id, slug, label, icon, model, credits_per_block, desc_user, inputs_desc, max_words, is_active";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("systems_public")
    .select(`${PUBLIC_COLUMNS}, system_variants(slug, label)`)
    .eq("is_active", true)
    .order("slug");

  if (error) {
    const fallback = await supabaseAdmin
      .from("systems")
      .select(PUBLIC_COLUMNS)
      .eq("is_active", true)
      .order("slug");
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ systems: fallback.data });
  }

  return NextResponse.json({ systems: data });
}
