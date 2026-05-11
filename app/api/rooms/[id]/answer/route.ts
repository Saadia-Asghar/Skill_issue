import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { gradeRoomAnswer } from "@/lib/rooms/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/:id/answer
 * Body: { questionIndex: number, choice: number }
 *
 * Server-side grading + atomic member update. Returns the verdict for the
 * caller's pick and (if they just crossed the pass threshold or ran out of
 * questions) their finish_position.
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
  const body = (await req.json().catch(() => ({}))) as {
    questionIndex?: unknown;
    choice?: unknown;
  };
  const questionIndex =
    typeof body.questionIndex === "number" && Number.isInteger(body.questionIndex)
      ? body.questionIndex
      : Number.NaN;
  const choice =
    typeof body.choice === "number" && Number.isInteger(body.choice)
      ? body.choice
      : Number.NaN;
  if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) {
    return NextResponse.json(
      { error: "`questionIndex` and `choice` must be integers" },
      { status: 400 },
    );
  }

  try {
    const result = await gradeRoomAnswer({
      roomId: id,
      userId,
      questionIndex,
      choice,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Grading failed" },
      { status: 400 },
    );
  }
}
