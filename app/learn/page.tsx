import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { SectionHeading } from "@/components/game/section-heading";
import { ALL_PERSONAS, CREATOR_PERSONAS } from "@/lib/ai/personas";

import { LearnFlow } from "./learn-flow";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const { userId } = await auth();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="◐ INFLUENCER SYNTHESIS ENGINE"
        title="Drop a concept. Pick your professor. Run the gauntlet."
        subtitle={
          <>
            Paste a paragraph from your textbook, a slide, an article,
            anything. The persona you pick will explain it in their signature
            voice — then throw three Socratic questions at you. Get one wrong
            and they&apos;ll come back sharper.
          </>
        }
      />
      {!userId && (
        <p className="mt-4 text-xs text-muted">
          <Link
            href="/sign-up"
            className="font-bold underline-offset-2 hover:underline"
            style={{ color: "var(--lime)" }}
          >
            Sign up
          </Link>{" "}
          to start saving your runs to the Fingerprint DB.
        </p>
      )}

      <div className="mt-10">
        <LearnFlow
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
    </div>
  );
}
