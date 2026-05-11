import "server-only";

import { z } from "zod";

import { generateGauntlet } from "@/lib/ai/gauntlet";
import type { GauntletQuestion } from "@/lib/ai/gauntlet";
import { getPersona } from "@/lib/ai/personas";
import {
  getAnonServerSupabase,
  getServerSupabase,
} from "@/lib/supabase/server";
import type {
  ConceptRow,
  GauntletAttemptRow,
  Json,
  RankTier,
} from "@/lib/supabase/types";

import { DEANS_LIST_SIZE } from "./constants";

/** Validates the shape of `daily_drops.questions` jsonb (3 canonical MCQs). */
const QuestionsJsonSchema = z
  .array(
    z.object({
      q: z.string(),
      choices: z.array(z.string()).length(4),
      correct_index: z.number().int().min(0).max(3),
      gotcha: z.string(),
    }),
  )
  .length(3);

export type DailyDrop = {
  drop_date: string;
  concept: ConceptRow;
  questions: GauntletQuestion[];
};

/** Decode the jsonb questions blob with runtime validation. */
function decodeQuestions(value: Json): GauntletQuestion[] {
  const parsed = QuestionsJsonSchema.parse(value);
  return parsed;
}

/**
 * Fetch today's drop without creating one. Cheap read used by the lobby and
 * the dashboard to show "today's drop is/isn't ready yet".
 */
export async function fetchDailyDrop(today: string): Promise<DailyDrop | null> {
  const supabase = getAnonServerSupabase();
  const { data, error } = await supabase
    .from("daily_drops")
    .select("drop_date, questions, concept:concepts(*)")
    .eq("drop_date", today)
    .maybeSingle();
  if (error || !data) return null;
  const concept = data.concept as unknown as ConceptRow | null;
  if (!concept) return null;
  return {
    drop_date: data.drop_date,
    concept,
    questions: decodeQuestions(data.questions),
  };
}

/**
 * Get today's Daily Drop, creating it lazily if this is the first request
 * since UTC midnight. Race-tolerant: two concurrent calls may both generate
 * questions, but only the first INSERT wins (drop_date is the primary key).
 * The losers re-fetch and get the winning row.
 */
export async function getOrCreateDailyDrop(today: string): Promise<DailyDrop> {
  const existing = await fetchDailyDrop(today);
  if (existing) return existing;

  const concept = await pickConceptForDrop();
  if (!concept) {
    throw new Error("No concepts available to drop");
  }

  // The Daily Drop questions must be the same for everyone, so we generate
  // them with a single neutral "Professor" persona prompt regardless of who
  // actually plays. Persona only affects the explanation voice.
  const persona = getPersona("professor");
  if (!persona) throw new Error("Missing required `professor` persona");

  const questions = await generateGauntlet({
    persona,
    text: concept.text,
    explanation: concept.text,
  });

  const supabase = getAnonServerSupabase();
  await supabase
    .from("daily_drops")
    .insert({
      drop_date: today,
      concept_id: concept.id,
      questions: questions as unknown as Json,
    })
    .select()
    .maybeSingle();
  // We deliberately ignore conflict errors here: if a concurrent caller won
  // the race, the row already exists and the re-fetch below picks it up.

  const after = await fetchDailyDrop(today);
  if (!after) {
    throw new Error("Daily Drop creation failed and no concurrent winner found");
  }
  return after;
}

/**
 * Pick a concept to use for today's drop. Prefers concepts that have never
 * been used as a Daily Drop before; falls back to a random repeat once the
 * pool is exhausted.
 */
async function pickConceptForDrop(): Promise<ConceptRow | null> {
  const supabase = getAnonServerSupabase();
  const { data: drops } = await supabase
    .from("daily_drops")
    .select("concept_id");
  const usedIds = new Set((drops ?? []).map((d) => d.concept_id));

  const { data: pool } = await supabase
    .from("concepts")
    .select("*");
  if (!pool || pool.length === 0) return null;

  const fresh = pool.filter((c) => !usedIds.has(c.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Single Dean's List row as displayed in the leaderboard component. */
export type LeaderboardEntry = {
  rank: number;
  clerk_id: string;
  username: string | null;
  avatar_url: string | null;
  elo: number;
  xp: number;
  tier: RankTier;
  current_streak: number;
};

/**
 * Top N Dean's List by Elo. Public read — no auth required.
 *
 * Returns up to `limit` entries (default 500). Each entry is annotated with
 * its 1-based global rank.
 */
export async function getDeansList(
  limit: number = DEANS_LIST_SIZE,
): Promise<LeaderboardEntry[]> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("users")
    .select("clerk_id, username, avatar_url, elo, xp, rank, current_streak")
    .order("elo", { ascending: false })
    .order("xp", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    clerk_id: row.clerk_id,
    username: row.username,
    avatar_url: row.avatar_url,
    elo: row.elo,
    xp: row.xp,
    tier: row.rank,
    current_streak: row.current_streak,
  }));
}

/**
 * Find the user's leaderboard position by Elo. Returns null if the user has
 * no profile row yet. Used to pin "you" to the bottom of the Dean's List
 * even when they're outside the top N.
 *
 * Implemented as: rank = 1 + (count of users with strictly higher elo).
 */
export async function getMyLeaderboardRow(
  clerkId: string,
): Promise<LeaderboardEntry | null> {
  const supabase = getAnonServerSupabase();
  const { data: me } = await supabase
    .from("users")
    .select("clerk_id, username, avatar_url, elo, xp, rank, current_streak")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  if (!me) return null;

  const { count } = await supabase
    .from("users")
    .select("clerk_id", { count: "exact", head: true })
    .gt("elo", me.elo);

  return {
    rank: (count ?? 0) + 1,
    clerk_id: me.clerk_id,
    username: me.username,
    avatar_url: me.avatar_url,
    elo: me.elo,
    xp: me.xp,
    tier: me.rank,
    current_streak: me.current_streak,
  };
}

/**
 * Returns the user's ranked attempt for the given drop_date if any. Used to
 * decide whether a new submission should be ranked or unranked.
 */
export async function fetchRankedAttempt(
  clerkId: string,
  dropDate: string,
): Promise<GauntletAttemptRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("gauntlet_attempts")
    .select("*")
    .eq("user_id", clerkId)
    .eq("drop_date", dropDate)
    .eq("is_ranked", true)
    .maybeSingle();
  return data ?? null;
}

/** Total number of ranked attempts the user has logged (used for K-factor). */
export async function countRankedAttempts(clerkId: string): Promise<number> {
  const supabase = getAnonServerSupabase();
  const { count } = await supabase
    .from("gauntlet_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", clerkId)
    .eq("is_ranked", true);
  return count ?? 0;
}

/** Most recent Colosseum attempt for the dashboard "last run" card. */
export async function fetchRecentAttempt(
  clerkId: string,
): Promise<GauntletAttemptRow | null> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("gauntlet_attempts")
    .select("*")
    .eq("user_id", clerkId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
