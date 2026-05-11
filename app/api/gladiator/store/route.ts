import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchAgoraData } from "@/lib/gladiator/queries";
import { ensureUserRow } from "@/lib/users/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    await ensureUserRow(userId);
    const data = await fetchAgoraData(userId);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load agora";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
