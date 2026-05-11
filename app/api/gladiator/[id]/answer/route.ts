import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  type GladiatorQuestion,
  pickOpeningQuestion,
  toQuestionJson,
} from "@/lib/gladiator/questions";
import {
  advanceGladiatorRound,
  GLADIATOR_BOT_ID,
  fetchGladiatorMatch,
  resolveGladiatorTimeout,
  submitGladiatorAnswer,
} from "@/lib/gladiator/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const match = await fetchGladiatorMatch(id);
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }
    if (match.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "match is already finished" }, { status: 400 });
    }
    const question = match.current_question as unknown as GladiatorQuestion;
    const body = (await req.json().catch(() => ({}))) as { choice?: unknown };
    const choice = typeof body.choice === "number" ? body.choice : Number.NaN;
    if (!Number.isInteger(choice)) {
      return NextResponse.json({ error: "choice must be an integer" }, { status: 400 });
    }

    const submitted = await submitGladiatorAnswer({
      matchId: id,
      actorId: userId,
      choice,
      answeredAt: new Date().toISOString(),
    });
    const isCorrect = choice === question.correctIndex;

    let updated = submitted;
    const roundResolved =
      submitted.phase === "RESOLVING" || submitted.phase === "FINISHED";
    if (submitted.status === "IN_PROGRESS" && submitted.phase === "RESOLVING") {
      const next = pickOpeningQuestion(`${id}:round:${submitted.round_number + 1}`);
      updated = await advanceGladiatorRound({
        matchId: id,
        nextQuestion: toQuestionJson(next),
      });
    }

    const shouldTriggerBot =
      updated.status === "IN_PROGRESS" &&
      updated.is_bot_match &&
      updated.p2_answered_at === null &&
      updated.player_two_id === GLADIATOR_BOT_ID;

    if (updated.status === "IN_PROGRESS") {
      updated = await resolveGladiatorTimeout(id);
      if (updated.phase === "RESOLVING") {
        const next = pickOpeningQuestion(`${id}:timeout:${updated.round_number + 1}`);
        updated = await advanceGladiatorRound({
          matchId: id,
          nextQuestion: toQuestionJson(next),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      isCorrect,
      shouldTriggerBot,
      roundResolved,
      match: updated,
      question,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to submit answer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
