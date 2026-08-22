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

  const { banned } = await req.json();
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_banned: !!banned })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
