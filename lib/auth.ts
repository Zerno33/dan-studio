import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export { getSupabaseAdmin };

export async function requireAdmin(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authHeader = req.headers.get("authorization");
  const { data: userData } = await supabaseAdmin.auth.getUser(
    authHeader?.replace("Bearer ", "")
  );
  if (!userData?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  return profile?.is_admin ? userData.user : null;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]+$/.test(slug) && slug.length <= 32;
}
