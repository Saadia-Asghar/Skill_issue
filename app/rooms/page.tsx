import { auth } from "@clerk/nextjs/server";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import { ROOM_DEFAULT_STUDY_SECONDS } from "@/lib/realtime/constants";

import { RoomsLobby } from "./lobby";

export const dynamic = "force-dynamic";

export default async function RoomsLobbyPage() {
  const { userId } = await auth();
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="◇ STUDY ROOMS ◇"
        title={
          <>
            Pile in. Different professors.{" "}
            <span style={{ color: "var(--accent-2)" }}>Same exam.</span>
          </>
        }
        subtitle={
          <>
            Create a 6-digit room code, paste a slide or lecture excerpt, and
            everyone studies it through their own persona. After{" "}
            {ROOM_DEFAULT_STUDY_SECONDS / 60} minutes the host triggers the
            quiz — first to get past the pass threshold takes #1, the rest
            finish in order.
          </>
        }
      />

      {!userId ? (
        <GameCard skin="cyan" className="mt-10 p-8 text-center">
          <h2 className="text-2xl font-bold">Sign in to host or join.</h2>
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
        <RoomsLobby />
      )}
    </div>
  );
}
