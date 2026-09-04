import { packUsdFromCredits, teacherCommissionUsd } from "@/lib/packs";

export function normalizeReferralCode(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 32) return null;
  if (!/^[a-z0-9_-]+$/.test(v)) return null;
  return v;
}

export function referredByFromAuthUser(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
} | null | undefined): string | null {
  const raw =
    user?.user_metadata?.referred_by ??
    user?.user_metadata?.referral_code ??
    user?.app_metadata?.referred_by ??
    "";
  return normalizeReferralCode(String(raw || ""));
}

export async function findTeacherByCode(
  supabaseAdmin: { from: (table: string) => any },
  code: string
): Promise<{ id: string } | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const exact = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("referral_code", normalized)
    .maybeSingle();
  if (exact.data?.id) return exact.data;
  const loose = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("referral_code", normalized)
    .maybeSingle();
  return loose.data?.id ? loose.data : null;
}

export async function linkReferralRow(
  supabaseAdmin: { from: (table: string) => { upsert: Function } },
  teacherId: string,
  userId: string
) {
  if (teacherId === userId) return;
  const { error } = await supabaseAdmin.from("referrals").upsert(
    {
      teacher_id: teacherId,
      user_id: userId,
      status: "active",
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error("referrals upsert:", (error as { message?: string }).message);
  }
}

/** Beta: ADMIN +900…3000 kr = wpłata $3–$10 (Polar nie ma). 20% dla nauczyciela z referred_by. */
export async function accrueTeacherCommissionFromGrant(
  supabaseAdmin: { from: (table: string) => any },
  studentUserId: string,
  creditDelta: number
): Promise<{ added: number; error?: string }> {
  const packUsd = packUsdFromCredits(creditDelta);
  if (packUsd == null) return { added: 0 };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("referred_by")
    .eq("id", studentUserId)
    .maybeSingle();
  const code = profile?.referred_by;
  if (!code) return { added: 0, error: "Uczeń nie ma referred_by — rejestracja z linku ?ref=" };

  const teacher = await findTeacherByCode(supabaseAdmin, String(code));
  if (!teacher || teacher.id === studentUserId) {
    return { added: 0, error: `Brak nauczyciela dla kodu ${code}` };
  }

  const add = teacherCommissionUsd(packUsd);
  const { data: existing } = await supabaseAdmin
    .from("referrals")
    .select("commission_accrued")
    .eq("user_id", studentUserId)
    .maybeSingle();
  const next = Number(existing?.commission_accrued || 0) + add;
  const { error } = await supabaseAdmin.from("referrals").upsert(
    {
      teacher_id: teacher.id,
      user_id: studentUserId,
      status: "active",
      commission_accrued: next,
    },
    { onConflict: "user_id" }
  );
  if (error) return { added: 0, error: error.message };
  return { added: add };
}
