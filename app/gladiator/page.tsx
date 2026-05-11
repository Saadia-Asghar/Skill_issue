import { auth } from "@clerk/nextjs/server";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { findActiveGladiatorMatchForUser } from "@/lib/gladiator/queries";

import { GladiatorHub } from "./hub";

export const dynamic = "force-dynamic";

export default async function GladiatorPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <GameCard className="p-8 text-center">
          <h1 className="text-3xl font-black">Gladiator Arena</h1>
          <p className="mt-3 text-muted">
            Sign in to earn Glory, climb the worldwide ladder, and duel in the
            marble pit.
          </p>
          <ArcadeLink href="/sign-in" skin="lime" size="lg" className="mt-6">
            ▶ Sign in to battle
          </ArcadeLink>
        </GameCard>
      </div>
    );
  }

  const active = await findActiveGladiatorMatchForUser(userId);
  return <GladiatorHub userId={userId} activeMatchId={active?.id ?? null} />;
}
