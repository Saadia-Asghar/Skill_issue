import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  fetchRecentGlobalMessages,
  insertGlobalMessage,
  type ChatMessageKind,
} from "@/lib/chat/queries";
import type { Json } from "@/lib/supabase/types";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const messages = await fetchRecentGlobalMessages(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    content?: unknown;
    kind?: unknown;
    payload?: unknown;
    personaSlug?: unknown;
  };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const kind =
    body.kind === "run_share" || body.kind === "system" || body.kind === "text"
      ? (body.kind as ChatMessageKind)
      : "text";
  const payload =
    body.payload && typeof body.payload === "object" ? body.payload : {};
  const personaSlug =
    typeof body.personaSlug === "string" ? body.personaSlug : null;

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
    await insertGlobalMessage({
      userId,
      content,
      kind,
      payload: payload as Json,
      personaSlug,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to post message" },
      { status: 500 },
    );
  }
}
