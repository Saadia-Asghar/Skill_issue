import { BLITZ_ELO_K } from "@/lib/realtime/constants";

/**
 * Standard FIDE-style Elo for 1v1 Blitz. K is constant at 24 (lower than the
 * Colosseum K of 32 for first-30 attempts, since Blitz outcomes are noisier).
 * The Postgres function {@link advance_blitz_question} is the source of truth
 * — these helpers exist for client-side preview ("if you win you'll gain X").
 */

export function blitzExpected(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * `outcome` is from A's perspective: 1 = A wins, 0 = B wins, 0.5 = draw.
 * Returns A's Elo delta (B receives the negative).
 */
export function blitzDelta(eloA: number, eloB: number, outcome: 0 | 0.5 | 1): number {
  return Math.round(BLITZ_ELO_K * (outcome - blitzExpected(eloA, eloB)));
}

/** Rough preview: "you'll gain X if you win, lose Y if you lose." */
export function blitzWinLossPreview(myElo: number, opponentElo: number) {
  return {
    onWin: blitzDelta(myElo, opponentElo, 1),
    onLoss: blitzDelta(myElo, opponentElo, 0),
  };
}
