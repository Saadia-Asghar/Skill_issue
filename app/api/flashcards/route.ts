import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  fetchAllFlashcards,
  fetchBoxDistribution,
  fetchDueFlashcards,
} from "@/lib/flashcards/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/flashcards
 *
 * Returns the user's full flashcard state in one round-trip:
 *   - `due`:    cards whose next_review_at <= now
 *   - `all`:    every card the user has, newest first (deck browser)
 *   - `boxes`:  box-distribution counts (for sparkline)
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const [due, all, boxes] = await Promise.all([
    fetchDueFlashcards(userId),
    fetchAllFlashcards(userId),
    fetchBoxDistribution(userId),
  ]);
  return NextResponse.json({ due, all, boxes });
}
