import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  fetchRecentRoomMessages,
  insertRoomMessage,
  type ChatMessageKind,
} from "@/lib/chat/queries";
import type { Json } from "@/lib/supabase/types";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const messages = await fetchRecentRoomMessages(
    id,
    Number.isFinite(limit) ? limit : 100,
  );
  return NextResponse.json({ messages });
}

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
    content?: unknown;
    kind?: unknown;
    payload?: unknown;
  };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const kind =
    body.kind === "run_share" || body.kind === "system" || body.kind === "text"
      ? (body.kind as ChatMessageKind)
      : "text";
  const payload =
    body.payload && typeof body.payload === "object" ? body.payload : {};
  if (!content) {
    return NextResponse.json({ error: "`content` is required" }, { status: 400 });
  }
  if (content.length > 1200) {
    return NextResponse.json(
      { error: "Message is too long (max 1200 chars)" },
      { status: 400 },
    );
  }
  try {
    await ensureUserRow(userId);
    await insertRoomMessage({
      roomId: id,
      userId,
      content,
      kind,
      payload: payload as Json,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to post message" },
      { status: 500 },
    );
  }
}
