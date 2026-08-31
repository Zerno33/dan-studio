export function normalizeReferralCode(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 32) return null;
  if (!/^[a-z0-9_-]+$/.test(v)) return null;
  return v;
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
  const { error } = await supabaseAdmin.from("referrals").upsert(
    {
      teacher_id: teacherId,
      user_id: userId,
      status: "active",
      commission_accrued: 0,
    },
    { onConflict: "user_id" }
  );
  if (error && !/relation|does not exist|referrals/i.test(String((error as { message?: string }).message))) {
    console.error("referrals upsert:", (error as { message?: string }).message);
  }
}
