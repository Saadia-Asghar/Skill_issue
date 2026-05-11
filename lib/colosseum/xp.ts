import {
  XP_CONCEPT_STUDIED,
  XP_DAILY_DROP_FIRST,
  XP_PER_CORRECT,
  XP_PERFECT_BONUS,
  XP_STREAK_MILESTONE_DAYS,
  XP_STREAK_MILESTONE_PER_DAY,
} from "./constants";

export type XpBreakdown = {
  studied: number;
  accuracy: number;
  perfect: number;
  dailyBonus: number;
  streakBonus: number;
  total: number;
};

/**
 * Compute the XP awarded for a single gauntlet completion.
 *
 *   studied      flat per-attempt engagement reward
 *   accuracy     XP_PER_CORRECT * correct
 *   perfect      one-shot bonus on 3/3
 *   dailyBonus   bonus on the first ranked Daily Drop attempt of the day
 *   streakBonus  awarded only when the user crosses a 7-day milestone
 */
export function computeXp({
  correct,
  isPerfect,
  isFirstRankedDropToday,
  newStreakDays,
  hadStreakMilestone,
}: {
  correct: number;
  isPerfect: boolean;
  isFirstRankedDropToday: boolean;
  newStreakDays: number;
  hadStreakMilestone: boolean;
}): XpBreakdown {
  const studied = XP_CONCEPT_STUDIED;
  const accuracy = XP_PER_CORRECT * Math.max(0, correct);
  const perfect = isPerfect ? XP_PERFECT_BONUS : 0;
  const dailyBonus = isFirstRankedDropToday ? XP_DAILY_DROP_FIRST : 0;
  const streakBonus = hadStreakMilestone
    ? newStreakDays * XP_STREAK_MILESTONE_PER_DAY
    : 0;
  const total = studied + accuracy + perfect + dailyBonus + streakBonus;
  return { studied, accuracy, perfect, dailyBonus, streakBonus, total };
}

export type StreakResult = {
  newStreak: number;
  streakDate: string;
  /** True iff the streak rolled over (today was not yesterday's continuation). */
  changed: boolean;
  /** True iff `newStreak` crossed a 7-day milestone. */
  hitMilestone: boolean;
};

/**
 * Compute the post-attempt streak state.
 *
 *   - If `lastStreakDate` is `today`, streak does not change (already counted).
 *   - If `lastStreakDate` is yesterday, increment.
 *   - Otherwise, reset to 1.
 *
 * `today` and `lastStreakDate` are ISO date strings (YYYY-MM-DD) in UTC.
 */
export function computeStreak({
  today,
  lastStreakDate,
  currentStreak,
}: {
  today: string;
  lastStreakDate: string | null;
  currentStreak: number;
}): StreakResult {
  if (lastStreakDate === today) {
    return {
      newStreak: currentStreak,
      streakDate: today,
      changed: false,
      hitMilestone: false,
    };
  }

  if (lastStreakDate && diffDays(lastStreakDate, today) === 1) {
    const next = currentStreak + 1;
    return {
      newStreak: next,
      streakDate: today,
      changed: true,
      hitMilestone: next > 0 && next % XP_STREAK_MILESTONE_DAYS === 0,
    };
  }

  return {
    newStreak: 1,
    streakDate: today,
    changed: true,
    hitMilestone: false,
  };
}

/**
 * Whole-day difference between two YYYY-MM-DD UTC strings.
 * `diffDays('2026-04-25', '2026-04-26')` === 1.
 */
export function diffDays(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Today's UTC date as YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Milliseconds until the next UTC midnight relative to `now`. The Daily Drop
 * is anchored to UTC so countdowns and freshness are globally consistent.
 */
export function millisUntilNextDrop(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
