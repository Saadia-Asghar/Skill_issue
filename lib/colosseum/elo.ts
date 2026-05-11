import {
  CONCEPT_DIFFICULTY_BASE_ELO,
  CONCEPT_DIFFICULTY_STEP,
  ELO_K_ESTABLISHED,
  ELO_K_NEW,
  ELO_K_THRESHOLD,
  SPEED_BONUS_CEILING_SECONDS,
} from "./constants";

/**
 * Map a concept's intrinsic difficulty (1-5) to its virtual-opponent Elo.
 * Difficulty 3 = 1500 Elo, ±150 per step.
 *
 *   diff 1 -> 1200    diff 2 -> 1350    diff 3 -> 1500
 *   diff 4 -> 1650    diff 5 -> 1800
 */
export function conceptElo(difficulty: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(difficulty)));
  return CONCEPT_DIFFICULTY_BASE_ELO + clamped * CONCEPT_DIFFICULTY_STEP;
}

/**
 * Standard logistic Elo expected score: probability the player "wins" the
 * matchup against a virtual opponent of given Elo.
 */
export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Performance score in [0, 1] combining accuracy and speed.
 *
 *   accuracy = correct / total
 *   timeBonus = max(0, 1 - elapsed / ceiling)
 *   perf = accuracy * (0.75 + 0.25 * timeBonus)
 *
 * Time multiplies accuracy: a 0/3 in 1 second is still 0. A 3/3 at the
 * ceiling is 0.75 (full credit, no speed bonus). A 3/3 in zero seconds is
 * 1.0. The formula is monotone in both inputs and bounded in [0, 1].
 */
export function performanceScore(
  correct: number,
  total: number,
  elapsedSeconds: number,
): number {
  if (total <= 0) return 0;
  const accuracy = Math.max(0, Math.min(1, correct / total));
  const timeBonus = Math.max(
    0,
    Math.min(1, 1 - elapsedSeconds / SPEED_BONUS_CEILING_SECONDS),
  );
  return Math.round(accuracy * (0.75 + 0.25 * timeBonus) * 1000) / 1000;
}

/**
 * Standard FIDE-style K-factor: high-K for new accounts so ratings settle
 * fast, lower K once a player is established to stop a single bad day from
 * cratering a top-500 Elo.
 */
export function eloK(rankedAttempts: number): number {
  return rankedAttempts >= ELO_K_THRESHOLD ? ELO_K_ESTABLISHED : ELO_K_NEW;
}

/**
 * Compute the Elo delta for a single attempt. Returns an integer (positive
 * or negative).  Standard Elo: delta = K * (actual - expected).
 */
export function eloDelta({
  playerElo,
  difficulty,
  performance,
  rankedAttempts,
}: {
  playerElo: number;
  difficulty: number;
  performance: number;
  rankedAttempts: number;
}): number {
  const opponent = conceptElo(difficulty);
  const expected = expectedScore(playerElo, opponent);
  const k = eloK(rankedAttempts);
  return Math.round(k * (performance - expected));
}
