import { NextResponse } from "next/server";

import { DEANS_LIST_SIZE } from "@/lib/colosseum/constants";
import { getDeansList } from "@/lib/colosseum/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/colosseum/leaderboard?limit=500
 * Returns: { entries: LeaderboardEntry[] }
 *
 * Public — the Dean's List is a global ranking. Default limit is 500 to
 * match the PRD; capped at 500 to keep the response under ~50KB.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("limit") ?? DEANS_LIST_SIZE);
  const limit = Math.max(1, Math.min(DEANS_LIST_SIZE, requested || DEANS_LIST_SIZE));
  const entries = await getDeansList(limit);
  return NextResponse.json({ entries });
}
