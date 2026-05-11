/**
 * Leitner box system — five boxes, five intervals.
 *
 *   Box 1 → review every day
 *   Box 2 → +3 days
 *   Box 3 → +7 days
 *   Box 4 → +14 days
 *   Box 5 → +30 days  (graduated; rarely surfaces)
 *
 * Correct answer: promote up by one (capped at 5).
 * Missed answer:  drop straight to box 1 (Leitner's "fall to the bottom").
 */

const BOX_INTERVAL_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export type Box = 1 | 2 | 3 | 4 | 5;

export function nextReviewDate(box: Box, from: Date = new Date()): Date {
  const days = BOX_INTERVAL_DAYS[box];
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function promote(box: number): Box {
  const next = Math.min(5, Math.max(1, box) + 1);
  return next as Box;
}

export function demote(): Box {
  return 1;
}

export function intervalDays(box: number): number {
  const b = Math.min(5, Math.max(1, box)) as Box;
  return BOX_INTERVAL_DAYS[b];
}

export function intervalLabel(box: number): string {
  const days = intervalDays(box);
  return days === 1 ? "1d" : `${days}d`;
}
