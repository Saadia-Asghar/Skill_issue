import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import { generateGauntlet } from "@/lib/ai/gauntlet";
import { getPersona } from "@/lib/ai/personas";
import { createSession } from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/gauntlet
 * Body: { text: string, explanation: string, personaSlug: string }
 * Returns: { sessionId: string, questions: { id, q, choices }[] }
 *
 * The full questions (with `correct_index` and `gotcha`) live server-side
 * keyed by `sessionId`. Clients only see the question prompt and choices
 * — grading happens in /api/gauntlet/answer.
 */
export async function POST(req: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    text?: unknown;
    explanation?: unknown;
    personaSlug?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const explanation =
    typeof body.explanation === "string" ? body.explanation.trim() : "";
  const personaSlug =
    typeof body.personaSlug === "string" ? body.personaSlug : "";

  if (!text || !explanation || !personaSlug) {
    return NextResponse.json(
      { error: "`text`, `explanation`, and `personaSlug` are all required" },
      { status: 400 },
    );
  }

  const persona = getPersona(personaSlug);
  if (!persona) {
    return NextResponse.json(
      { error: `Unknown persona: ${personaSlug}` },
      { status: 400 },
    );
  }

  try {
    const questions = await generateGauntlet({ persona, text, explanation });
    const sessionId = createSession({
      questions,
      text,
      personaSlug: persona.slug,
    });

    return NextResponse.json({
      sessionId,
      questions: questions.map((q, i) => ({
        id: i,
        q: q.q,
        choices: q.choices,
      })),
    });
  } catch (e) {
    console.error("[gauntlet] generation failed", e);
    return NextResponse.json(
      {
        error: "Could not generate quiz right now. Please try once again.",
      },
      { status: 500 },
    );
  }
}
