import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/blitz/:id/advance
 * Body: { force?: boolean }
 *
 * Watchdog endpoint. Called by the client whenever the per-question 12-second
 * timer ticks past zero, in case the second player ghosted. The Postgres fn
 * is idempotent: if the question was already advanced (e.g. both answers
 * landed before the timer fired), this call is a cheap no-op.
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
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  const force = body.force === true;

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("advance_blitz_question", {
    p_match_id: id,
    p_force: force,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ match: data });
}
