import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { purchaseItem } from "@/lib/gladiator/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  try {
    const inventory = await purchaseItem(userId, itemId);
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "purchase failed";
    const status = /insufficient glory points/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
