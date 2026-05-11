import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { assertHost } from "@/lib/rooms/queries";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/:id/quiz
 *
 * Host-only. Transitions STUDY -> QUIZ. Members race through the canonical
 * questions; first to pass_threshold correct wins (finish_position = 1).
 */
export async function POST(
  _req: Request,
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
  if (room.state !== "STUDY") {
    return NextResponse.json(
      { error: `Room is in ${room.state}, can only start quiz from STUDY` },
      { status: 409 },
    );
  }
  if (!room.questions) {
    return NextResponse.json(
      { error: "Room has no questions yet — call /start first" },
      { status: 409 },
    );
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("study_rooms")
    .update({
      state: "QUIZ",
      quiz_started_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to start quiz" },
      { status: 500 },
    );
  }
  return NextResponse.json({ room: data });
}
