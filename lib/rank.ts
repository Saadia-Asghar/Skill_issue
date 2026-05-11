import type { RankTier } from "./supabase/types";

/**
 * XP thresholds for each academic rank. A user's rank is the highest tier
 * whose threshold they have met. Mirrors the public.rank_tier enum.
 */
export const RANK_THRESHOLDS: Array<{ rank: RankTier; xp: number }> = [
  { rank: "Freshman", xp: 0 },
  { rank: "Sophomore", xp: 500 },
  { rank: "Junior", xp: 1500 },
  { rank: "Senior", xp: 3500 },
  { rank: "Graduate", xp: 7500 },
  { rank: "PhD", xp: 15000 },
  { rank: "Dean", xp: 30000 },
];

export function rankForXp(xp: number): RankTier {
  let current: RankTier = "Freshman";
  for (const tier of RANK_THRESHOLDS) {
    if (xp >= tier.xp) current = tier.rank;
    else break;
  }
  return current;
}

export function nextRank(rank: RankTier): {
  nextRank: RankTier | null;
  nextXp: number | null;
} {
  const idx = RANK_THRESHOLDS.findIndex((t) => t.rank === rank);
  const next = RANK_THRESHOLDS[idx + 1];
  return next
    ? { nextRank: next.rank, nextXp: next.xp }
    : { nextRank: null, nextXp: null };
}

export function rankProgress(
  xp: number,
  rank: RankTier,
): { current: number; next: number; pct: number } {
  const idx = RANK_THRESHOLDS.findIndex((t) => t.rank === rank);
  const tier = RANK_THRESHOLDS[idx];
  const next = RANK_THRESHOLDS[idx + 1];
  if (!next) return { current: tier.xp, next: tier.xp, pct: 100 };
  const pct = Math.min(
    100,
    Math.max(0, ((xp - tier.xp) / (next.xp - tier.xp)) * 100),
  );
  return { current: tier.xp, next: next.xp, pct };
}
