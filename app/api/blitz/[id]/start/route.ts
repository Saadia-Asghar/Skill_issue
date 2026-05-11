import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/blitz/:id/start
 *
 * Either player presses this once their 2-minute study timer hits zero (or
 * they hit "Skip study"). The Postgres function transitions STUDY -> BLITZ
 * idempotently, so concurrent calls collapse safely.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("start_blitz_phase", {
    p_match_id: id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ match: data });
}
