import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ALL_PERSONAS, CREATOR_PERSONAS } from "@/lib/ai/personas";
import { fetchDailyDrop } from "@/lib/colosseum/queries";
import { todayUtc } from "@/lib/colosseum/xp";

import { ColosseumPlay } from "./play-flow";

export const dynamic = "force-dynamic";

export default async function ColosseumPlayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/colosseum/play");

  const today = todayUtc();
  const drop = await fetchDailyDrop(today);
  // If the drop hasn't been generated yet, the play page server-side will
  // still trigger generation lazily through POST /api/colosseum/drop. We
  // pre-load the concept teaser only if it's already there.

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <ColosseumPlay
        dropDate={today}
        conceptTitle={drop?.concept.title ?? "Loading today's drop…"}
        conceptText={drop?.concept.text ?? null}
        conceptDifficulty={drop?.concept.difficulty ?? null}
        personas={ALL_PERSONAS.map((p) => ({
          slug: p.slug,
          name: p.name,
          tagline: p.tagline,
          accentColor: p.accentColor,
          isCreator: p.isCreator,
        }))}
        creatorSlugs={CREATOR_PERSONAS.map((p) => p.slug)}
      />
    </div>
  );
}
