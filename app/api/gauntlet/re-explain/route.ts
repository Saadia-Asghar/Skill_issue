import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import { streamReExplanation } from "@/lib/ai/explain";
import { getPersona } from "@/lib/ai/personas";
import { getSession } from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gauntlet/re-explain
 * Body: { sessionId: string, questionId: number, userChoice: number }
 * Returns: text/plain stream — a "shorter, sharper" re-explanation
 *          targeting only the misconception revealed by the wrong choice.
 *
 * The session, persona, and full question (including correct answer) are
 * looked up server-side. The client never sends — and never sees — the
 * answer key.
 */
export async function POST(req: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: unknown;
    questionId?: unknown;
    userChoice?: unknown;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const questionId =
    typeof body.questionId === "number" ? body.questionId : Number.NaN;
  const userChoice =
    typeof body.userChoice === "number" ? body.userChoice : Number.NaN;

  if (
    !sessionId ||
    !Number.isInteger(questionId) ||
    !Number.isInteger(userChoice)
  ) {
    return NextResponse.json(
      { error: "`sessionId`, `questionId`, and `userChoice` are required" },
      { status: 400 },
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Gauntlet session expired or not found" },
      { status: 404 },
    );
  }

  const question = session.questions[questionId];
  if (!question) {
    return NextResponse.json(
      { error: `Invalid questionId: ${questionId}` },
      { status: 400 },
    );
  }

  const persona = getPersona(session.personaSlug);
  if (!persona) {
    return NextResponse.json(
      { error: `Unknown persona on session: ${session.personaSlug}` },
      { status: 500 },
    );
  }

  const result = streamReExplanation({
    persona,
    text: session.text,
    question: question.q,
    userChoice: question.choices[userChoice] ?? "(no answer)",
    correctAnswer: question.choices[question.correct_index],
  });

  return result.toTextStreamResponse();
}
