import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { fetchGladiatorStudyOptions } from "@/lib/gladiator/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const data = await fetchGladiatorStudyOptions();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
