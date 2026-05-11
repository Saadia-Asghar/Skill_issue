import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchGladiatorMatch } from "@/lib/gladiator/queries";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const match = await fetchGladiatorMatch(id);
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }
    if (![match.player_one_id, match.player_two_id].includes(userId)) {
      return NextResponse.json({ error: "not a participant" }, { status: 403 });
    }
    const supabase = await getServerSupabase();
    const { data: players } = await supabase
      .from("users")
      .select("clerk_id, username, avatar_url")
      .in("clerk_id", [match.player_one_id, match.player_two_id]);

    const playerMap = new Map(
      (players ?? []).map((p) => [
        p.clerk_id,
        {
          id: p.clerk_id,
          username: p.username,
          avatarUrl: p.avatar_url,
        },
      ]),
    );

    if (match.player_two_id === "BOT_ID" && !playerMap.has("BOT_ID")) {
      playerMap.set("BOT_ID", {
        id: "BOT_ID",
        username: "Ghost Bot",
        avatarUrl: null,
      });
    }

    return NextResponse.json({
      match,
      you: userId,
      players: {
        p1: playerMap.get(match.player_one_id) ?? {
          id: match.player_one_id,
          username: null,
          avatarUrl: null,
        },
        p2: playerMap.get(match.player_two_id) ?? {
          id: match.player_two_id,
          username: null,
          avatarUrl: null,
        },
      },
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to fetch match";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
