import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import {
  assertHost,
  generateRoomQuestions,
} from "@/lib/rooms/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/:id/start
 *
 * Host-only. Generates the canonical quiz questions from the room's
 * sourceText (if not already generated) and transitions the room from LOBBY
 * to STUDY. The two-stage handoff (LOBBY -> STUDY -> QUIZ) is intentional:
 * STUDY is a per-member explanation phase that everyone tailors with their
 * own persona, then any host call to /quiz advances to the racing quiz.
 *
 * Body: { sourceText?: string } — optional override if the host wants to
 * change the source after creating the room.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let room;
  try {
    room = await assertHost(id, userId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  if (room.state !== "LOBBY") {
    return NextResponse.json(
      { error: `Room is in ${room.state} state, can't start study` },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { sourceText?: unknown };
  const overrideSource =
    typeof body.sourceText === "string" ? body.sourceText : null;
  const sourceText = overrideSource ?? room.source_text;
  if (!sourceText || sourceText.trim().length < 30) {
    return NextResponse.json(
      {
        error:
          "Need at least 30 characters of lecture / slide text to generate a quiz",
      },
      { status: 400 },
    );
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY isn't configured — Study Rooms need it to generate questions.",
      },
      { status: 503 },
    );
  }

  let questions: Json;
  try {
    const generated = await generateRoomQuestions(sourceText);
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

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("study_rooms")
    .update({
      source_text: sourceText,
      questions,
      state: "STUDY",
      study_started_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update room" },
      { status: 500 },
    );
  }
  return NextResponse.json({ room: data });
}
