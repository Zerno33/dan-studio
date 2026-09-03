import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function wipe(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  column: string,
  id: string
) {
  const { error } = await supabaseAdmin.from(table).delete().eq(column, id);
  if (error && !/schema cache|does not exist|relation/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { id } = await params;
  if (!id || id === admin.id) {
    return NextResponse.json({ error: "Nie możesz usunąć własnego konta." }, { status: 403 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Nieprawidłowe konto." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    await wipe(supabaseAdmin, "ratings", "user_id", id);
    await wipe(supabaseAdmin, "prompts", "user_id", id);
    await wipe(supabaseAdmin, "folders", "user_id", id);
    await wipe(supabaseAdmin, "referrals", "user_id", id);
    await wipe(supabaseAdmin, "referrals", "teacher_id", id);
    await wipe(supabaseAdmin, "payout_requests", "teacher_id", id);
    await wipe(supabaseAdmin, "credit_transactions", "user_id", id);
    await wipe(supabaseAdmin, "credits", "user_id", id);
    await wipe(supabaseAdmin, "consent_log", "user_id", id);
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", id);
    if (profileError && !/schema cache|does not exist/i.test(profileError.message)) {
      throw new Error(profileError.message);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("admin delete rows:", msg);
    return NextResponse.json({ error: "Nie usunięto wierszy w bazie." }, { status: 500 });
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) {
    console.error("admin delete auth:", authError.message);
    return NextResponse.json({ error: "Profil skasowany, ale Auth nie puścił maila. Spróbuj jeszcze raz." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
