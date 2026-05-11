import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchBlitzMatch } from "@/lib/blitz/queries";
import type { BlitzQuestion } from "@/lib/blitz/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/blitz/:id
 *
 * Returns the public state of the match plus a SAFE view of the current
 * question (stripped of `correct_index` and `gotcha` until the question
 * resolves). Used to bootstrap the page render before realtime takes over.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const match = await fetchBlitzMatch(id);
  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }
  if (![match.player_a, match.player_b].includes(userId)) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }

  const allQuestions = match.questions as unknown as BlitzQuestion[];
  const safeQuestions = allQuestions.map(({ q, choices }) => ({ q, choices }));

  return NextResponse.json({
    match: {
      id: match.id,
      state: match.state,
      concept: {
        id: match.concept.id,
        title: match.concept.title,
        text: match.concept.text,
        difficulty: match.concept.difficulty,
      },
      player_a: match.player_a,
      player_b: match.player_b,
      persona_a: match.persona_a,
      persona_b: match.persona_b,
      current_q: match.current_q,
      q_started_at: match.q_started_at,
      study_started_at: match.study_started_at,
      blitz_started_at: match.blitz_started_at,
      finished_at: match.finished_at,
      player_a_correct: match.player_a_correct,
      player_b_correct: match.player_b_correct,
      winner: match.winner,
      player_a_elo_before: match.player_a_elo_before,
      player_b_elo_before: match.player_b_elo_before,
      player_a_elo_after: match.player_a_elo_after,
      player_b_elo_after: match.player_b_elo_after,
    },
    questions: safeQuestions,
    you: userId,
  });
}
