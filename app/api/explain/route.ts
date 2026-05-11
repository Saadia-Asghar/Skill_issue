import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import { streamExplanation } from "@/lib/ai/explain";
import { getPersona } from "@/lib/ai/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_LENGTH = 12_000;

/**
 * POST /api/explain
 * Body: { text: string, personaSlug: string }
 * Returns: text/plain stream — the persona's deep explanation of `text`.
 */
export async function POST(req: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  let body: { text?: unknown; personaSlug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const personaSlug = typeof body.personaSlug === "string" ? body.personaSlug : "";

  if (!text) {
    return NextResponse.json({ error: "`text` is required" }, { status: 400 });
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `\`text\` exceeds ${MAX_INPUT_LENGTH} characters` },
      { status: 413 },
    );
  }

  const persona = getPersona(personaSlug);
  if (!persona) {
    return NextResponse.json(
      { error: `Unknown persona: ${personaSlug}` },
      { status: 400 },
    );
  }

  const result = streamExplanation({ persona, text });
  return result.toTextStreamResponse();
}
