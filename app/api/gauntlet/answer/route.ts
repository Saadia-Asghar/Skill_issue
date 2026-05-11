import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { generateRoastToastVerdict } from "@/lib/ai/roast-toast";
import {
  consecutiveRoastStreak,
  getSession,
  recentVerdicts,
  recordAnswer,
  recordVerdict,
} from "@/lib/ai/store";
import { getPersona } from "@/lib/ai/personas";
import { autoForgeFlashcards } from "@/lib/flashcards/generate";
import { getServerSupabase } from "@/lib/supabase/server";

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
  const { userId } = await auth();
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
  const persona = getPersona(session.personaSlug);
  const dbRecentVerdicts: string[] = [];
  if (userId) {
    const supabase = await getServerSupabase();
    const [{ data: gauntletVerdicts }, { data: blitzVerdicts }] = await Promise.all([
      supabase
        .from("gauntlet_attempts")
        .select("slang_verdict")
        .eq("user_id", userId)
        .not("slang_verdict", "is", null)
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("blitz_answers")
        .select("slang_verdict")
        .eq("user_id", userId)
        .not("slang_verdict", "is", null)
        .order("answered_at", { ascending: false })
        .limit(2),
    ]);
    for (const row of gauntletVerdicts ?? []) {
      if (typeof row.slang_verdict === "string") dbRecentVerdicts.push(row.slang_verdict);
    }
    for (const row of blitzVerdicts ?? []) {
      if (typeof row.slang_verdict === "string") dbRecentVerdicts.push(row.slang_verdict);
    }
  }
  const sessionRecent = recentVerdicts(sessionId, 2);
  const roastStreak = consecutiveRoastStreak(sessionId) + (correct ? 0 : 1);
  const verdict = await generateRoastToastVerdict({
    persona: persona ?? {
      slug: "professor",
      name: "The Professor",
      tagline: "Classic Socratic pedagogy with rigor",
      isCreator: false,
      accentColor: "#3b82f6",
      systemPrompt: "",
      reExplainPrompt: "",
      voiceId: "",
    },
    conceptText: session.text,
    question: question.q,
    userChoice: question.choices[choice] ?? "(no answer)",
    correctAnswer: question.choices[question.correct_index],
    isCorrect: correct,
    recentVerdicts: [...dbRecentVerdicts, ...sessionRecent].slice(-3),
    losingStreak: roastStreak,
  });
  recordVerdict(sessionId, { text: verdict.slang_verdict, mode: verdict.mode });

  // Detect "last question of the gauntlet": the user has now submitted an
  // answer for every question we generated. We forge flashcards once per
  // session — auto-forge has its own daily-cap on the concept side. We do
  // this on free-play /learn flows too, but only when the user is signed in.
  let flashcardsForged = 0;
  const allAnswered =
    Object.keys(session.answers).length === session.questions.length;
  if (allAnswered) {
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
    slang_verdict: verdict.slang_verdict,
    correct_index: question.correct_index,
    correct_choice: question.choices[question.correct_index],
    your_choice: question.choices[choice] ?? null,
    gotcha: question.gotcha,
    flashcards_forged: flashcardsForged,
  });
}
