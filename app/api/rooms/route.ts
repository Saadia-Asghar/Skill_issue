import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { generateUniqueRoomCode } from "@/lib/rooms/queries";
import { ROOM_DEFAULT_STUDY_SECONDS, ROOM_PASS_THRESHOLD } from "@/lib/realtime/constants";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms
 * Body: { title?: string, sourceText?: string, studySeconds?: number }
 *
 * Creates a fresh study room in the LOBBY state. The host is auto-joined as
 * the first member (no persona yet — they pick on the room page like everyone
 * else).
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    sourceText?: unknown;
    studySeconds?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.slice(0, 80) : "Study Room";
  const sourceText =
    typeof body.sourceText === "string" ? body.sourceText.slice(0, 12_000) : null;
  const studySeconds =
    typeof body.studySeconds === "number" && body.studySeconds > 30
      ? Math.min(600, Math.floor(body.studySeconds))
      : ROOM_DEFAULT_STUDY_SECONDS;

  const code = await generateUniqueRoomCode();
  const supabase = await getServerSupabase();
  const { data: room, error } = await supabase
    .from("study_rooms")
    .insert({
      code,
      host_id: userId,
      title,
      source_text: sourceText,
      study_seconds: studySeconds,
      pass_threshold: ROOM_PASS_THRESHOLD,
    })
    .select("*")
    .single();
  if (error || !room) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create room" },
      { status: 500 },
    );
  }

  // Auto-join the host. We don't fail if the row already exists (idempotent).
  await supabase
    .from("study_room_members")
    .upsert({
      room_id: room.id,
      user_id: userId,
    });

  return NextResponse.json({ room });
}
