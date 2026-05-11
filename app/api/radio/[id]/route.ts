import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchEpisode } from "@/lib/radio/queries";

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
