import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { pickOpeningQuestion, toQuestionJson } from "@/lib/gladiator/questions";
import {
  advanceGladiatorRound,
  fetchGladiatorMatch,
  resolveGladiatorTimeout,
} from "@/lib/gladiator/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
    if (![match.player_one_id, match.player_two_id].includes(userId)) {
      return NextResponse.json({ error: "not a participant" }, { status: 403 });
    }

    let updated = await resolveGladiatorTimeout(id);
    if (updated.status === "IN_PROGRESS" && updated.phase === "RESOLVING") {
      const next = pickOpeningQuestion(`${id}:resolve:${updated.round_number + 1}`);
      updated = await advanceGladiatorRound({
        matchId: id,
        nextQuestion: toQuestionJson(next),
      });
    }
    return NextResponse.json({ ok: true, match: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to resolve round";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
