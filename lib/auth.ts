import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export { getSupabaseAdmin };

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireUser(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  return userData?.user ?? null;
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return null;
  const email = (user.email || "").toLowerCase();
  if (email && adminEmails().includes(email)) return user;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return profile?.is_admin ? user : null;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]+$/.test(slug) && slug.length <= 32;
}
