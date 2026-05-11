import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import {
  dequeueOrEnqueue,
  leaveBlitzQueue,
  pickRandomConcept,
} from "@/lib/blitz/queries";
import { generateBlitzQuestions } from "@/lib/blitz/questions";
import { humanizeSupabaseError } from "@/lib/supabase/errors";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/blitz/queue
 * Body: { personaSlug: string }
 *
 * Joins the matchmaking queue. Returns:
 *   { status: "matched", matchId } if a partner was waiting; the partner row
 *   was popped under a SKIP-LOCKED lock so this is race-safe.
 *   { status: "queued" } if no partner; the client should subscribe to its
 *   blitz-lobby channel and wait for an INSERT on blitz_matches.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY isn't configured — Blitz needs a question generator.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    personaSlug?: unknown;
  };
  const personaSlug =
    typeof body.personaSlug === "string" ? body.personaSlug : "";
  const persona = getPersona(personaSlug);
  if (!persona) {
    return NextResponse.json(
      { error: "`personaSlug` is required and must be a known persona" },
      { status: 400 },
    );
  }

  const concept = await pickRandomConcept();
  if (!concept) {
    return NextResponse.json(
      { error: "No concepts available — seed the concepts table first." },
      { status: 503 },
    );
  }

  // Generate the canonical question pool *before* enqueueing so both players
  // see the same questions. (The waiter's questions are discarded — only the
  // joiner's questions land in the new match row.)
  let questions: Json;
  try {
    const generated = await generateBlitzQuestions(concept.text);
    questions = generated as unknown as Json;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Question generation failed: ${e.message}`
            : "Question generation failed",
      },
      { status: 502 },
    );
  }

  let matchId: string | null = null;
  try {
    matchId = await dequeueOrEnqueue({
      userId,
      personaSlug: persona.slug,
      conceptId: concept.id,
      questions,
    });
  } catch (e) {
    const h = humanizeSupabaseError(e);
    return NextResponse.json(
      { error: h.message, hint: h.hint },
      { status: h.status },
    );
  }

  if (matchId) {
    return NextResponse.json({ status: "matched", matchId });
  }
  return NextResponse.json({ status: "queued" });
}

/** DELETE /api/blitz/queue — leave the matchmaking queue. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  await leaveBlitzQueue(userId);
  return NextResponse.json({ ok: true });
}
