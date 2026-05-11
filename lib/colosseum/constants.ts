/**
 * Tunable parameters for the Cognitive Colosseum.
 *
 * Kept in one place so balance changes are diffable.  All numbers are
 * dimensionless ratios or whole units (seconds, XP points, Elo points).
 */

/** Standard Elo K-factor for new accounts (<30 ranked attempts). */
export const ELO_K_NEW = 32;
/** Lower K-factor once a player has settled, to stop a single bad day from
 * tanking a top-500 rating. */
export const ELO_K_ESTABLISHED = 16;
/** Number of ranked attempts after which K downgrades. */
export const ELO_K_THRESHOLD = 30;

/** Each concept difficulty (1-5) maps to a virtual opponent Elo. The midpoint
 * (1500) corresponds to difficulty 3, with ~150 Elo per difficulty step. */
export const CONCEPT_DIFFICULTY_BASE_ELO = 1050;
export const CONCEPT_DIFFICULTY_STEP = 150;

/** Ceiling on rewarded gauntlet duration (seconds). Past this, time-bonus
 * is zero — the user still gets accuracy XP, just no speed component. */
export const SPEED_BONUS_CEILING_SECONDS = 180;

/** Base accuracy XP per correct answer. */
export const XP_PER_CORRECT = 10;
/** Bonus for a perfect 3/3. */
export const XP_PERFECT_BONUS = 20;
/** Granted once for studying any concept (regardless of score). */
export const XP_CONCEPT_STUDIED = 5;
/** Bonus on the first ranked Daily Drop attempt of the day. */
export const XP_DAILY_DROP_FIRST = 25;
/** Streak milestone bonus formula: every 7 days, 5*streak XP. */
export const XP_STREAK_MILESTONE_DAYS = 7;
export const XP_STREAK_MILESTONE_PER_DAY = 5;

/** Number of users shown on the public Dean's List. */
export const DEANS_LIST_SIZE = 500;
