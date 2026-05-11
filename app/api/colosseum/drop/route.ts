import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import { createSession } from "@/lib/ai/store";
import { fetchDailyDrop, getOrCreateDailyDrop } from "@/lib/colosseum/queries";
import { todayUtc } from "@/lib/colosseum/xp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/colosseum/drop
 * Returns: {
 *   drop_date: string,
 *   concept: { id, title, text, difficulty },
 * }
 *
 * Public — anyone can preview today's drop teaser. Lazily creates the drop
 * (and its canonical questions) on the first request after UTC midnight if
 * an Anthropic key is configured. Without a key, returns whatever existing
 * row is in the table (or 503 if there's nothing yet).
 */
export async function GET() {
  const today = todayUtc();
  const existing = await fetchDailyDrop(today);
  if (existing) {
    return NextResponse.json({
      drop_date: existing.drop_date,
      concept: {
        id: existing.concept.id,
        title: existing.concept.title,
        text: existing.concept.text,
        difficulty: existing.concept.difficulty,
      },
    });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      {
        error:
          "Today's drop hasn't been generated yet and ANTHROPIC_API_KEY is not configured.",
      },
      { status: 503 },
    );
  }
  try {
    const drop = await getOrCreateDailyDrop(today);
    return NextResponse.json({
      drop_date: drop.drop_date,
      concept: {
        id: drop.concept.id,
        title: drop.concept.title,
        text: drop.concept.text,
        difficulty: drop.concept.difficulty,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load drop" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/colosseum/drop
 * Body: { personaSlug: string }
 * Returns: {
 *   sessionId: string,
 *   drop_date: string,
 *   concept: { id, title, text, difficulty },
 *   questions: { id, q, choices }[],
 * }
 *
 * Creates a fresh gauntlet session preloaded with the canonical questions
 * for today's drop. The server starts the timer at the moment this returns
 * (see `lib/ai/store.ts#gauntletStartedAt`). Persona is captured on the
 * session so the wrong-answer re-explanation streams in the right voice.
 */
export async function POST(req: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    personaSlug?: unknown;
  };
  const personaSlug =
    typeof body.personaSlug === "string" ? body.personaSlug : "";
  if (!personaSlug) {
    return NextResponse.json(
      { error: "`personaSlug` is required" },
      { status: 400 },
    );
  }

  const today = todayUtc();
  let drop;
  try {
    drop = await getOrCreateDailyDrop(today);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load drop" },
      { status: 500 },
    );
  }

  const sessionId = createSession({
    questions: drop.questions,
    text: drop.concept.text,
    personaSlug: personaSlug as never,
    conceptId: drop.concept.id,
    dropDate: drop.drop_date,
  });

  return NextResponse.json({
    sessionId,
    drop_date: drop.drop_date,
    concept: {
      id: drop.concept.id,
      title: drop.concept.title,
      text: drop.concept.text,
      difficulty: drop.concept.difficulty,
    },
    questions: drop.questions.map((q, i) => ({
      id: i,
      q: q.q,
      choices: q.choices,
    })),
  });
}
