import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchEpisode } from "@/lib/radio/queries";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/radio/[id]
 * Used by the player page to poll status while a generation is in flight.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const episode = await fetchEpisode(id);
  if (!episode || episode.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ episode });
}

/**
 * DELETE /api/radio/[id]
 * Removes one episode from the user's library. Used by the studio's library
 * panel to sweep failed/abandoned generations.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const episode = await fetchEpisode(id);
  if (!episode || episode.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("radio_episodes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
