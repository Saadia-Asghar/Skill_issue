import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { reviewCard } from "@/lib/flashcards/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/flashcards/review
 * Body: { cardId: string, verdict: "got_it" | "missed" }
 *
 * Applies a Leitner review: promote on got_it, drop to box 1 on missed.
 * Returns the updated card so the client can update its local state.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    cardId?: unknown;
    verdict?: unknown;
  };
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const verdict =
    body.verdict === "got_it" || body.verdict === "missed" ? body.verdict : null;
  if (!cardId || !verdict) {
    return NextResponse.json(
      { error: "`cardId` and `verdict` are required" },
      { status: 400 },
    );
  }
  const card = await reviewCard({ userId, cardId, verdict });
  if (!card) {
    return NextResponse.json(
      { error: "Card not found or not yours" },
      { status: 404 },
    );
  }
  return NextResponse.json({ card });
}
