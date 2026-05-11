import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { pickOpeningQuestion, toQuestionJson } from "@/lib/gladiator/questions";
import {
  ensureGladiatorBot,
  ensureGladiatorProfile,
  fetchGladiatorStudyOptions,
  queueOrMatch,
} from "@/lib/gladiator/queries";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      solo?: unknown;
      subjectId?: unknown;
      conceptId?: unknown;
    };
    const solo = body.solo === true;
    const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
    const conceptId = typeof body.conceptId === "string" ? body.conceptId : null;
    if (!subjectId) {
      return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
    }

    await ensureUserRow(userId);
    await ensureGladiatorBot();
    await ensureGladiatorProfile(userId);

    const options = await fetchGladiatorStudyOptions();
    const validSubject = options.subjects.some((s) => s.id === subjectId);
    if (!validSubject) {
      return NextResponse.json({ error: "Invalid subject selected" }, { status: 400 });
    }
    const validConcept =
      !conceptId ||
      options.concepts.some((c) => c.id === conceptId && c.subject_id === subjectId);
    if (!validConcept) {
      return NextResponse.json(
        { error: "Selected concept does not belong to the chosen subject" },
        { status: 400 },
      );
    }

    const opening = pickOpeningQuestion(`${userId}:${Date.now()}`);
    const matchId = await queueOrMatch({
      userId,
      forceBot: solo,
      openingQuestion: toQuestionJson(opening),
      subjectId,
      conceptId,
    });

    return NextResponse.json({ matchId, solo, subjectId, conceptId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to queue match";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
