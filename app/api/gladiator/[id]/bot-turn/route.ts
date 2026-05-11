import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  advanceGladiatorRound,
  fetchGladiatorMatch,
  submitGladiatorAnswer,
  GLADIATOR_BOT_ID,
} from "@/lib/gladiator/queries";
import {
  type GladiatorQuestion,
  pickOpeningQuestion,
  toQuestionJson,
} from "@/lib/gladiator/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const match = await fetchGladiatorMatch(id);
    if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
    if (![match.player_one_id, match.player_two_id].includes(userId)) {
      return NextResponse.json({ error: "not a participant" }, { status: 403 });
    }
    if (
      match.status !== "IN_PROGRESS" ||
      !match.is_bot_match ||
      match.player_two_id !== GLADIATOR_BOT_ID ||
      match.p2_answered_at !== null
    ) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const question = match.current_question as unknown as GladiatorQuestion;
    const latencyMs = randomInt(3000, 8000);
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    const chance = botSuccessChance(question.difficulty);
    const isCorrect = Math.random() < chance;
    const updated = await submitGladiatorAnswer({
      matchId: id,
      actorId: GLADIATOR_BOT_ID,
      choice: isCorrect ? question.correctIndex : randomWrongChoice(question),
      answeredAt: new Date().toISOString(),
    });

    if (updated.status === "IN_PROGRESS" && updated.phase === "RESOLVING") {
      const next = pickOpeningQuestion(`${id}:bot:${updated.round_number + 1}`);
      await advanceGladiatorRound({
        matchId: id,
        nextQuestion: toQuestionJson(next),
      });
    }

    return NextResponse.json({ ok: true, isCorrect, latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed bot turn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function botSuccessChance(difficulty: number): number {
  if (difficulty <= 1) return 0.82;
  if (difficulty === 2) return 0.65;
  if (difficulty === 3) return 0.48;
  return 0.35;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomWrongChoice(question: GladiatorQuestion): number {
  const optionsCount = Array.isArray(question.options) ? question.options.length : 4;
  const all = Array.from({ length: Math.max(2, optionsCount) }, (_, i) => i);
  const wrong = all.filter((i) => i !== question.correctIndex);
  return wrong[Math.floor(Math.random() * wrong.length)] ?? 0;
}
