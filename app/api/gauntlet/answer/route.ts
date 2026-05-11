import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getSession, recordAnswer } from "@/lib/ai/store";
import { autoForgeFlashcards } from "@/lib/flashcards/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gauntlet/answer
 * Body: { sessionId: string, questionId: number, choice: number }
 * Returns: {
 *   correct: boolean,
 *   correct_index: number,
 *   correct_choice: string,
 *   your_choice: string | null,
 *   gotcha: string,
 * }
 *
 * Server-side grading — the client never receives the answer key, only the
 * verdict for the choice it submitted, plus the correct answer revealed
 * after the submission so we can show feedback.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: unknown;
    questionId?: unknown;
    choice?: unknown;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const questionId =
    typeof body.questionId === "number" ? body.questionId : Number.NaN;
  const choice = typeof body.choice === "number" ? body.choice : Number.NaN;

  if (!sessionId || !Number.isInteger(questionId) || !Number.isInteger(choice)) {
    return NextResponse.json(
      { error: "`sessionId`, `questionId`, and `choice` are required" },
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

  recordAnswer(sessionId, questionId, choice);

  const correct = choice === question.correct_index;

  // Detect "last question of the gauntlet": the user has now submitted an
  // answer for every question we generated. We forge flashcards once per
  // session — auto-forge has its own daily-cap on the concept side. We do
  // this on free-play /learn flows too, but only when the user is signed in.
  let flashcardsForged = 0;
  const allAnswered =
    Object.keys(session.answers).length === session.questions.length;
  if (allAnswered) {
    const { userId } = await auth();
    if (userId) {
      try {
        const cards = await autoForgeFlashcards({
          userId,
          conceptId: session.conceptId,
          conceptTitle:
            session.text.split("\n")[0]?.slice(0, 80).trim() || "Free play",
          conceptText: session.text,
          source: session.conceptId ? "colosseum" : "gauntlet",
          personaSlug: session.personaSlug,
        });
        flashcardsForged = cards.length;
      } catch (e) {
        console.error("[gauntlet/answer] flashcard auto-forge failed", e);
      }
    }
  }

  return NextResponse.json({
    correct,
    correct_index: question.correct_index,
    correct_choice: question.choices[question.correct_index],
    your_choice: question.choices[choice] ?? null,
    gotcha: question.gotcha,
    flashcards_forged: flashcardsForged,
  });
}
