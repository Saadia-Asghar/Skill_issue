import { auth } from "@clerk/nextjs/server";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import { ALL_PERSONAS } from "@/lib/ai/personas";
import { fetchMyEpisodes, fetchTopPersonas } from "@/lib/radio/queries";

import { RadioStudio } from "./studio";

export const dynamic = "force-dynamic";

export default async function RadioPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20">
        <GameCard skin="cyan" pulse className="p-10 text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ◉ professor radio ◉
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Sign in to tune in.
          </h1>
          <p className="mt-3 text-muted">
            Professor Radio turns your notes into a 5-minute podcast in your
            favorite persona voices.
          </p>
          <div className="mt-7 flex justify-center">
            <ArcadeLink href="/sign-up" skin="cyan" size="lg">
              ▶ CREATE PROFILE
            </ArcadeLink>
          </div>
        </GameCard>
      </div>
    );
  }

  const [episodes, topSlugs] = await Promise.all([
    fetchMyEpisodes(userId),
    fetchTopPersonas(userId, 3),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="◉ PROFESSOR RADIO"
        title="Spin up a 5-minute episode in any persona."
        subtitle={
          <>
            Drop a topic, pick up to three professors, and we&apos;ll
            broadcast it as a real audio episode you can listen to between
            classes.
          </>
        }
      />
      <div className="mt-10">
        <RadioStudio
          initialEpisodes={episodes}
          personas={ALL_PERSONAS.map((p) => ({
            slug: p.slug,
            name: p.name,
            tagline: p.tagline,
            accentColor: p.accentColor,
          }))}
          defaultPersonaSlugs={topSlugs}
        />
      </div>
    </div>
  );
}
