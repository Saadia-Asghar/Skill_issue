import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { generateRoastToastVerdict } from "@/lib/ai/roast-toast";
import { getPersona } from "@/lib/ai/personas";
import { fetchBlitzMatch } from "@/lib/blitz/queries";
import type { BlitzQuestion } from "@/lib/blitz/questions";
import { insertSystemGlobalMessage } from "@/lib/chat/queries";
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
  const match = await fetchBlitzMatch(matchId);
  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }
  if (questionIndex < 0 || questionIndex >= (match.questions as unknown[]).length) {
    return NextResponse.json({ error: "invalid question index" }, { status: 400 });
  }
  const questions = match.questions as unknown as BlitzQuestion[];
  const question = questions[questionIndex];
  const correct = choice === question.correct_index;
  const personaSlug = match.player_a === userId ? match.persona_a : match.persona_b;
  const persona = getPersona(personaSlug ?? "professor");

  const [{ data: recentBlitz }, { data: recentGauntlet }] = await Promise.all([
    supabase
      .from("blitz_answers")
      .select("slang_verdict")
      .eq("user_id", userId)
      .not("slang_verdict", "is", null)
      .order("answered_at", { ascending: false })
      .limit(2),
    supabase
      .from("gauntlet_attempts")
      .select("slang_verdict")
      .eq("user_id", userId)
      .not("slang_verdict", "is", null)
      .order("created_at", { ascending: false })
      .limit(2),
  ]);
  const recent = [...(recentBlitz ?? []), ...(recentGauntlet ?? [])]
    .map((r) => r.slang_verdict)
    .filter((v): v is string => typeof v === "string")
    .slice(-3);
  const losingStreak = !correct
    ? recent.filter((v) => /\bcooked|skill issue|caught in 4k|L\b/i.test(v)).length + 1
    : 0;
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
    conceptText: match.concept.text,
    question: question.q,
    userChoice: question.choices[choice] ?? "(no answer)",
    correctAnswer: question.choices[question.correct_index],
    isCorrect: correct,
    recentVerdicts: recent,
    losingStreak,
  });

  const { error: writeErr } = await supabase.rpc("record_blitz_answer", {
    p_match_id: matchId,
    p_user_id: userId,
    p_question_index: questionIndex,
    p_choice: choice,
  });
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 400 });
  }

  await supabase
    .from("blitz_answers")
    .update({ slang_verdict: verdict.slang_verdict })
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .eq("question_index", questionIndex);

  // Try to advance immediately (no-op if the other player hasn't answered).
  const { data: advanced, error: advErr } = await supabase.rpc("advance_blitz_question", {
    p_match_id: matchId,
    p_force: false,
  });
  if (advErr) {
    return NextResponse.json({ error: advErr.message }, { status: 400 });
  }

  try {
    const advancedMatch = advanced as
      | {
          state?: string;
          winner?: string | null;
          player_a?: string;
          player_a_correct?: number;
          player_b_correct?: number;
        }
      | null;
    if (advancedMatch?.state === "FINISHED") {
      const aScore = advancedMatch.player_a_correct ?? 0;
      const bScore = advancedMatch.player_b_correct ?? 0;
      if (advancedMatch.winner === userId) {
        await insertSystemGlobalMessage({
          personaSlug: "mr_viral",
          content: `mr viral: ${userId.slice(0, 6)} just clutched blitz ${aScore}-${bScore}. arena went loud.`,
          payload: { event: "blitz_win", match_id: matchId, score: { a: aScore, b: bScore } },
        });
      } else if (!advancedMatch.winner && advancedMatch.player_a === userId) {
        await insertSystemGlobalMessage({
          personaSlug: "tech_reviewer",
          content: `tech reviewer: blitz draw ${aScore}-${bScore}. perfectly balanced chaos.`,
          payload: { event: "blitz_draw", match_id: matchId, score: { a: aScore, b: bScore } },
        });
      }
    }
  } catch {
    // non-critical side effect
  }

  return NextResponse.json({
    ok: true,
    correct,
    slang_verdict: verdict.slang_verdict,
  });
}
