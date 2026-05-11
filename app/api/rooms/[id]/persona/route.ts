import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getPersona } from "@/lib/ai/personas";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/:id/persona
 * Body: { personaSlug: string }
 *
 * Records the caller's persona pick for this room. RLS enforces that a member
 * can only update their own row.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { personaSlug?: unknown };
  const personaSlug =
    typeof body.personaSlug === "string" ? body.personaSlug : "";
  const persona = getPersona(personaSlug);
  if (!persona) {
    return NextResponse.json(
      { error: "Unknown persona slug" },
      { status: 400 },
    );
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("study_room_members")
    .update({ persona_slug: persona.slug })
    .eq("room_id", id)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
