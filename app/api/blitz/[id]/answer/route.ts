import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/blitz/:id/answer
 * Body: { questionIndex: number, choice: number }
 *
 * Records the caller's pick for the active question (server-stamped time
 * resolves the race) and immediately attempts to advance the question.
 * advance_blitz_question() is a no-op until both players have answered or
 * the per-question timer has elapsed, so calling it here is cheap and means
 * the second answerer also drives the transition without waiting for a tick.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await ctx.params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    questionIndex?: unknown;
    choice?: unknown;
  };
  const questionIndex =
    typeof body.questionIndex === "number" && Number.isInteger(body.questionIndex)
      ? body.questionIndex
      : Number.NaN;
  const choice =
    typeof body.choice === "number" && Number.isInteger(body.choice)
      ? body.choice
      : Number.NaN;
  if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) {
    return NextResponse.json(
      { error: "`questionIndex` and `choice` must be integers" },
      { status: 400 },
    );
  }

  const supabase = await getServerSupabase();
  const { error: writeErr } = await supabase.rpc("record_blitz_answer", {
    p_match_id: matchId,
    p_user_id: userId,
    p_question_index: questionIndex,
    p_choice: choice,
  });
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 400 });
  }

  // Try to advance immediately (no-op if the other player hasn't answered).
  const { error: advErr } = await supabase.rpc("advance_blitz_question", {
    p_match_id: matchId,
    p_force: false,
  });
  if (advErr) {
    return NextResponse.json({ error: advErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
