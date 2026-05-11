import "server-only";

import {
  getAnonServerSupabase,
  getServerSupabase,
} from "@/lib/supabase/server";
import type {
  BlitzAnswerRow,
  BlitzMatchRow,
  ConceptRow,
  Json,
} from "@/lib/supabase/types";

export type BlitzMatchWithConcept = BlitzMatchRow & { concept: ConceptRow };

/** Fetch a match row + the joined concept (for title & body text). */
export async function fetchBlitzMatch(
  matchId: string,
): Promise<BlitzMatchWithConcept | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("blitz_matches")
    .select("*, concept:concepts(*)")
    .eq("id", matchId)
    .maybeSingle();
  if (!data) return null;
  const { concept, ...rest } = data as unknown as BlitzMatchRow & {
    concept: ConceptRow | null;
  };
  if (!concept) return null;
  return { ...(rest as BlitzMatchRow), concept };
}

/**
 * Pick a random concept for a fresh blitz match. Cheaper than the Daily Drop
 * version: blitz matches don't avoid repeats globally because matches are
 * private to two players.
 */
export async function pickRandomConcept(): Promise<ConceptRow | null> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase.from("concepts").select("*");
  if (!data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)];
}

/** All blitz answers for a match, ordered by (question, time). */
export async function fetchBlitzAnswers(
  matchId: string,
): Promise<BlitzAnswerRow[]> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("blitz_answers")
    .select("*")
    .eq("match_id", matchId)
    .order("question_index", { ascending: true })
    .order("answered_at", { ascending: true });
  return data ?? [];
}

/**
 * Idempotent matchmaking: tries to pop the oldest waiter (excluding the
 * caller); if none exists, enqueues the caller and returns null. Returns the
 * new (or existing) match id otherwise.
 *
 * The Postgres function does the heavy lifting (SKIP LOCKED + Insert) under
 * a single transaction — see migration `blitz_rooms_flashcards_radio`.
 */
export async function dequeueOrEnqueue(opts: {
  userId: string;
  personaSlug: string;
  conceptId: string;
  questions: Json;
}): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("dequeue_blitz_partner", {
    p_user_id: opts.userId,
    p_persona_slug: opts.personaSlug,
    p_concept_id: opts.conceptId,
    p_questions: opts.questions,
  });
  if (error) throw new Error(error.message);
  return data as string | null;
}

export async function leaveBlitzQueue(userId: string): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.from("blitz_queue").delete().eq("user_id", userId);
}

/**
 * Find any in-flight blitz match the user is part of. Used by `/blitz` to
 * redirect a returning user back to their open game.
 */
export async function findActiveMatchForUser(
  userId: string,
): Promise<BlitzMatchRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("blitz_matches")
    .select("*")
    .in("state", ["WAITING", "STUDY", "BLITZ"])
    .or(`player_a.eq.${userId},player_b.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
