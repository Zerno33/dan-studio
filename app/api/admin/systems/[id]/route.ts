import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin, isValidSlug } from "@/lib/auth";

// Nigdy nie prerenderować statycznie — endpoint zależy od nagłówka
// Authorization i env vars w runtime, nie w czasie builda.
export const dynamic = "force-dynamic";


const SYSTEM_COLUMNS =
  "id, slug, label, icon, model, moderation_rule, max_words, credits_per_block, desc_user, inputs_desc, system_prompt, version, is_active, updated_at, created_at";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });

  const { id } = await params;

  const body = await req.json();

  if (body.slug !== undefined && !isValidSlug(body.slug)) {
    return NextResponse.json({ error: "Nieprawidłowy slug." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: current } = await supabaseAdmin
    .from("systems")
    .select("system_prompt, version")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "System nie znaleziony." }, { status: 404 });
  }

  const promptChanged =
    body.systemPrompt !== undefined && body.systemPrompt !== current.system_prompt;

  const { data, error } = await supabaseAdmin
    .from("systems")
    .update({
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.label !== undefined && { label: body.label }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.moderationRule !== undefined && { moderation_rule: body.moderationRule }),
      ...(body.maxWords !== undefined && { max_words: body.maxWords }),
      ...(body.credits !== undefined && { credits_per_block: body.credits }),
      ...(body.desc !== undefined && { desc_user: body.desc }),
      ...(body.inputs !== undefined && { inputs_desc: body.inputs }),
      ...(body.systemPrompt !== undefined && { system_prompt: body.systemPrompt }),
      ...(body.isActive !== undefined && { is_active: body.isActive }),
      version: promptChanged ? current.version + 1 : current.version,
    })
    .eq("id", id)
    .select(SYSTEM_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ system: data, versionBumped: promptChanged });
}
