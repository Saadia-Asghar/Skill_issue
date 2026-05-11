import "server-only";

import { getAnonServerSupabase } from "@/lib/supabase/server";
import type { ConceptRow, FlashcardRow } from "@/lib/supabase/types";

import { demote, nextReviewDate, promote, type Box } from "./leitner";

export type FlashcardWithConcept = FlashcardRow & {
  concept: Pick<ConceptRow, "id" | "title"> | null;
};

/** All cards due today (or earlier) for the user, oldest-overdue first. */
export async function fetchDueFlashcards(
  userId: string,
  limit: number = 60,
): Promise<FlashcardWithConcept[]> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("flashcards")
    .select("*, concept:concepts(id, title)")
    .eq("user_id", userId)
    .lte("next_review_at", new Date().toISOString())
    .order("next_review_at", { ascending: true })
    .limit(limit);
  // Postgrest auto-introspection sometimes serializes the join with a
  // `SelectQueryError` placeholder in the generated TS types; the cast
  // through `unknown` is a tidy escape hatch.
  return (data ?? []) as unknown as FlashcardWithConcept[];
}

/** All cards for the user, joined with concept (used by the deck browser). */
export async function fetchAllFlashcards(
  userId: string,
): Promise<FlashcardWithConcept[]> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("flashcards")
    .select("*, concept:concepts(id, title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as FlashcardWithConcept[];
}

/** Box-distribution counts for the dashboard sparkline. */
export async function fetchBoxDistribution(
  userId: string,
): Promise<Record<Box, number>> {
  const supabase = getAnonServerSupabase();
  const dist: Record<Box, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const { data } = await supabase
    .from("flashcards")
    .select("box")
    .eq("user_id", userId);
  (data ?? []).forEach((row) => {
    const b = Math.min(5, Math.max(1, row.box)) as Box;
    dist[b] += 1;
  });
  return dist;
}

/** Lightweight count for nav/dashboard badges. */
export async function countDueToday(userId: string): Promise<number> {
  const supabase = getAnonServerSupabase();
  const { count } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("next_review_at", new Date().toISOString());
  return count ?? 0;
}

/**
 * Apply a Leitner review verdict to a single card. "got_it" promotes,
 * "missed" demotes to box 1; both update `next_review_at` accordingly.
 */
export async function reviewCard(opts: {
  userId: string;
  cardId: string;
  verdict: "got_it" | "missed";
}): Promise<FlashcardRow | null> {
  const supabase = getAnonServerSupabase();
  const { data: card } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", opts.cardId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!card) return null;

  const newBox = opts.verdict === "got_it" ? promote(card.box) : demote();
  const { data: updated } = await supabase
    .from("flashcards")
    .update({
      box: newBox,
      next_review_at: nextReviewDate(newBox).toISOString(),
      last_reviewed_at: new Date().toISOString(),
      reviewed_count: card.reviewed_count + 1,
      correct_count:
        card.correct_count + (opts.verdict === "got_it" ? 1 : 0),
    })
    .eq("id", opts.cardId)
    .eq("user_id", opts.userId)
    .select("*")
    .maybeSingle();
  return updated ?? null;
}
