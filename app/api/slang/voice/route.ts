import { NextResponse } from "next/server";

import type { PersonaSlug } from "@/lib/ai/personas";
import { voiceShortLine } from "@/lib/radio/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: unknown;
    personaSlug?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const personaSlug =
    typeof body.personaSlug === "string" ? (body.personaSlug as PersonaSlug) : undefined;

  if (!text) {
    return NextResponse.json({ error: "`text` is required" }, { status: 400 });
  }
  try {
    const bytes = await voiceShortLine({
      text: text.slice(0, 140),
      speakerSlug: personaSlug,
    });
    const body = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "slang voice failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
