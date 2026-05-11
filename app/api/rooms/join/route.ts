import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchRoomByCode } from "@/lib/rooms/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/join
 * Body: { code: string }
 *
 * Joins the caller into the room with the given 6-char code. Idempotent —
 * re-joining (e.g. after a refresh) returns the same room with no error.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Code must be 6 alphanumeric characters" },
      { status: 400 },
    );
  }

  const room = await fetchRoomByCode(code);
  if (!room) {
    return NextResponse.json(
      { error: "No room with that code" },
      { status: 404 },
    );
  }
  if (room.state === "FINISHED") {
    return NextResponse.json(
      { error: "That room is already finished" },
      { status: 410 },
    );
  }

  await ensureUserRow(userId);
  const supabase = await getServerSupabase();
  await supabase
    .from("study_room_members")
    .upsert({ room_id: room.id, user_id: userId });

  return NextResponse.json({ room });
}
