import { auth } from "@clerk/nextjs/server";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import { ALL_PERSONAS } from "@/lib/ai/personas";
import { findActiveMatchForUser } from "@/lib/blitz/queries";
import {
  BLITZ_QUESTION_SECONDS,
  BLITZ_STUDY_SECONDS,
} from "@/lib/realtime/constants";

import { BlitzLobby } from "./lobby";

export const dynamic = "force-dynamic";

export default async function BlitzLobbyPage() {
  const { userId } = await auth();

  if (userId) {
    const active = await findActiveMatchForUser(userId);
    if (active) {
      return <ResumeRedirect matchId={active.id} />;
    }
  }

  const personas = ALL_PERSONAS.map((p) => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    accentColor: p.accentColor,
    isCreator: p.isCreator,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="⚔ 1v1 BLITZ ⚔"
        title={
          <>
            Two minds.{" "}
            <span style={{ color: "var(--magenta)" }}>Two minutes.</span>{" "}
            Sudden death.
          </>
        }
        subtitle={
          <>
            We pair you with another player, drop a single concept, and give
            you both {BLITZ_STUDY_SECONDS / 60} minutes to study a
            custom-tailored explanation in the persona of your choice. Then
            it&apos;s rapid-fire — first to 3 correct wins, with{" "}
            {BLITZ_QUESTION_SECONDS}s per question. Winner steals Elo from
            the loser.
          </>
        }
      />

      {!userId ? (
        <GameCard skin="magenta" className="mt-10 p-8 text-center">
          <h2 className="text-2xl font-bold">Sign in to enter the Blitz.</h2>
          <p className="mt-2 text-sm text-muted">
            Matchmaking is Elo-aware — we need a profile to seed it.
          </p>
          <ArcadeLink
            href="/sign-up"
            skin="lime"
            size="lg"
            className="mt-6"
          >
            ▶ Create profile
          </ArcadeLink>
        </GameCard>
      ) : (
        <BlitzLobby personas={personas} userId={userId} />
      )}
    </div>
  );
}

function ResumeRedirect({ matchId }: { matchId: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--magenta)" }}
      >
        ⚔ live match in progress ⚔
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">
        Pick up where you left off
      </h1>
      <p className="mt-3 text-base text-muted">
        Your opponent is waiting. Resume to keep your Elo on the line.
      </p>
      <ArcadeLink
        href={`/blitz/${matchId}`}
        skin="magenta"
        size="lg"
        className="mt-8"
      >
        ▶ RESUME MATCH
      </ArcadeLink>
    </div>
  );
}
