import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin, isValidSlug } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = String(body.code || "").trim().toLowerCase();
  if (raw && !isValidSlug(raw)) {
    return NextResponse.json({ error: "Kod: a-z, 0-9, -, _, max 32." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ referral_code: raw || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
