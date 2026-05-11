import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { generateRoastToastVerdict } from "@/lib/ai/roast-toast";
import { getPersona } from "@/lib/ai/personas";
import { insertSystemGlobalMessage } from "@/lib/chat/queries";
import { elapsedSeconds, getSession } from "@/lib/ai/store";
import { eloDelta, performanceScore } from "@/lib/colosseum/elo";
import {
  countRankedAttempts,
  fetchDailyDrop,
  fetchRankedAttempt,
  getMyLeaderboardRow,
} from "@/lib/colosseum/queries";
import { computeStreak, computeXp, todayUtc } from "@/lib/colosseum/xp";
import { autoForgeFlashcards } from "@/lib/flashcards/generate";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/colosseum/submit
 * Body: { sessionId: string }
 *
 * Finalizes a Colosseum gauntlet session:
 *
 *   1. Looks up the session (which carries server-tracked startedAt + answers).
 *   2. Grades each of the 3 stored answers against the canonical questions.
 *   3. Computes performance (accuracy + speed) and Elo delta.
 *   4. Computes XP breakdown (engagement, accuracy, perfection, daily-drop
 *      bonus, streak milestone) and the new streak state.
 *   5. Calls the `record_gauntlet_attempt` Postgres function which atomically
 *      writes the attempt and updates `users.elo`/`xp`/`rank`/`current_streak`.
 *   6. Returns the full deltas + the user's new global leaderboard rank.
 *
 * Ranked vs unranked:
 *   - First Daily Drop attempt of the day  -> ranked (Elo + leaderboard)
 *   - Subsequent attempts (or non-drop)    -> unranked (XP only, no Elo)
 *
 * The unique partial index on (user_id, drop_date) where is_ranked enforces
 * the same constraint at the DB level, so a double-submit race can't double
 * a player's ranked score.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: unknown;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "`sessionId` is required" },
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
  if (!session.conceptId) {
    return NextResponse.json(
      {
        error:
          "This session is not a Colosseum run. Submit only Daily Drop sessions here.",
      },
      { status: 400 },
    );
  }

  // Re-verify the drop still references this concept (defensive — drops are
  // immutable but a future migration shouldn't be able to silently break it).
  const today = todayUtc();
  const dropDate = session.dropDate ?? today;
  const drop = await fetchDailyDrop(dropDate);
  if (!drop || drop.concept.id !== session.conceptId) {
    return NextResponse.json(
      { error: "Drop reference mismatch" },
      { status: 409 },
    );
  }

  // Grade.
  const total = session.questions.length;
  const elapsed = elapsedSeconds(session);
  const perQuestion = session.questions.map((q, i) => {
    const choice = session.answers[i];
    return {
      id: i,
      your_choice: typeof choice === "number" ? choice : null,
      correct_index: q.correct_index,
      gotcha: q.gotcha,
      isCorrect: choice === q.correct_index,
    };
  });
  const correct = perQuestion.filter((q) => q.isCorrect).length;
  const perf = performanceScore(correct, total, elapsed);
  const persona = getPersona(session.personaSlug);

  // Decide ranked vs unranked.
  const existingRanked = await fetchRankedAttempt(userId, dropDate);
  const isRanked = !existingRanked;

  // Load the user row (for Elo + streak inputs). Auto-create if missing so
  // direct hits to /learn don't require visiting /dashboard first.
  await ensureUserRow(userId);
  const supabase = await getServerSupabase();
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("elo, current_streak, last_streak_date, xp, rank, username")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (userError || !userRow) {
    return NextResponse.json(
      {
        error:
          userError?.message ??
          "User profile not found — call /api/users/sync first.",
      },
      { status: 404 },
    );
  }

  // Elo delta only counts on ranked submissions.
  const rankedSoFar = await countRankedAttempts(userId);
  const delta = isRanked
    ? eloDelta({
        playerElo: userRow.elo,
        difficulty: drop.concept.difficulty,
        performance: perf,
        rankedAttempts: rankedSoFar,
      })
    : 0;

  // Streak only ticks on ranked drops, so spamming free-play can't keep it alive.
  const streak = isRanked
    ? computeStreak({
        today: dropDate,
        lastStreakDate: userRow.last_streak_date,
        currentStreak: userRow.current_streak,
      })
    : {
        newStreak: userRow.current_streak,
        streakDate: userRow.last_streak_date ?? dropDate,
        changed: false,
        hitMilestone: false,
      };

  const xp = computeXp({
    correct,
    isPerfect: correct === total,
    isFirstRankedDropToday: isRanked,
    newStreakDays: streak.newStreak,
    hadStreakMilestone: streak.hitMilestone,
  });

  // Atomic write via Postgres function.
  const { data: attempt, error: rpcError } = await supabase.rpc(
    "record_gauntlet_attempt",
    {
      p_user_id: userId,
      p_concept_id: drop.concept.id,
      p_drop_date: dropDate,
      p_persona_slug: session.personaSlug,
      p_correct_count: correct,
      p_elapsed_seconds: elapsed,
      p_performance: perf,
      p_is_ranked: isRanked,
      p_elo_delta: delta,
      p_xp_delta: xp.total,
      p_new_streak: streak.newStreak,
      p_streak_date: streak.streakDate,
    },
  );
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // Re-read the user's leaderboard position to surface their new rank.
  const me = await getMyLeaderboardRow(userId);

  // Best-effort: auto-forge spaced-repetition flashcards in the user's
  // best-fitting persona's voice. Awaited so the client can show the
  // "X new cards" badge in the result, but errors are swallowed inside.
  const newCards = await autoForgeFlashcards({
    userId,
    conceptId: drop.concept.id,
    conceptTitle: drop.concept.title,
    conceptText: drop.concept.text,
    source: "colosseum",
    personaSlug: session.personaSlug,
  });

  const { data: recentRows } = await supabase
    .from("gauntlet_attempts")
    .select("slang_verdict")
    .eq("user_id", userId)
    .not("slang_verdict", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const recent = (recentRows ?? [])
    .map((r) => r.slang_verdict)
    .filter((v): v is string => typeof v === "string");
  const runVerdict = await generateRoastToastVerdict({
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
    conceptText: drop.concept.text,
    question: `Daily Drop run (${dropDate})`,
    userChoice: `${correct}/${total} correct`,
    correctAnswer: `target: ${total}/${total}`,
    isCorrect: correct === total,
    recentVerdicts: recent,
    losingStreak: correct === total ? 0 : recent.filter((v) => /\bcooked|skill issue|caught in 4k|L\b/i.test(v)).length + 1,
  });
  await supabase
    .from("gauntlet_attempts")
    .update({ slang_verdict: runVerdict.slang_verdict })
    .eq("id", attempt.id);

  try {
    if (correct === total) {
      await insertSystemGlobalMessage({
        personaSlug: "mr_viral",
        content: `mr viral: ${userRow.username ?? "A challenger"} just full-cleared today's drop. actual cinema.`,
        payload: { event: "perfect_drop", user_id: userId, correct, total },
      });
    } else if (correct === 0) {
      await insertSystemGlobalMessage({
        personaSlug: "tech_reviewer",
        content: `tech reviewer: ${userRow.username ?? "a runner"} went 0/${total}. brutal benchmark, run it back.`,
        payload: { event: "bombed_drop", user_id: userId, correct, total },
      });
    } else if (Math.abs(delta) >= 40) {
      await insertSystemGlobalMessage({
        personaSlug: "twitch_streamer",
        content: `twitch streamer: huge elo swing (${delta > 0 ? "+" : ""}${delta}) by ${userRow.username ?? "a player"}. chat is awake.`,
        payload: { event: "massive_elo_swing", user_id: userId, elo_delta: delta },
      });
    }
  } catch {
    // Non-critical side effect.
  }

  return NextResponse.json({
    attempt,
    summary: {
      correct,
      total,
      elapsed_seconds: elapsed,
      performance: perf,
      is_ranked: isRanked,
      elo: {
        before: userRow.elo,
        after: userRow.elo + delta,
        delta,
      },
      xp,
      streak: {
        before: userRow.current_streak,
        after: streak.newStreak,
        changed: streak.changed,
        milestone: streak.hitMilestone,
      },
      leaderboard: me,
      flashcards_forged: newCards.length,
      slang_verdict: runVerdict.slang_verdict,
    },
    questions: perQuestion.map((q) => ({
      id: q.id,
      isCorrect: q.isCorrect,
      your_choice: q.your_choice,
      correct_index: q.correct_index,
      gotcha: q.gotcha,
    })),
  });
}
