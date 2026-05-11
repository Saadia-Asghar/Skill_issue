import { auth } from "@clerk/nextjs/server";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import {
  fetchAllFlashcards,
  fetchBoxDistribution,
  fetchDueFlashcards,
} from "@/lib/flashcards/queries";

import { FlashcardsView } from "./view";

export const dynamic = "force-dynamic";

export default async function FlashcardsPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20">
        <GameCard skin="purple" pulse className="p-10 text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ✦ flashcard forge ✦
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Sign in to forge flashcards.
          </h1>
          <p className="mt-3 text-muted">
            Cards are auto-generated after every Colosseum run, in your best
            persona&apos;s voice.
          </p>
          <div className="mt-7 flex justify-center">
            <ArcadeLink href="/sign-up" skin="lime" size="lg">
              ▶ CREATE PROFILE
            </ArcadeLink>
          </div>
        </GameCard>
      </div>
    );
  }

  const [due, all, boxes] = await Promise.all([
    fetchDueFlashcards(userId),
    fetchAllFlashcards(userId),
    fetchBoxDistribution(userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="✦ FLASHCARD FORGE"
        title="Daily reps. Spaced repetition. Your weak concepts, sharpened."
        subtitle={
          <>
            Cards forged from your worst Colosseum misses, scheduled by
            Leitner box. Hit them every morning to keep the fingerprint warm.
          </>
        }
      />
      <div className="mt-10">
        <FlashcardsView
          initialDue={due}
          initialAll={all}
          initialBoxes={boxes}
        />
      </div>
    </div>
  );
}
