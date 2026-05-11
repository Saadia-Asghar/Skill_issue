import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { ALL_PERSONAS, getPersona } from "@/lib/ai/personas";
import { fetchBlitzMatch } from "@/lib/blitz/queries";
import type { BlitzQuestion } from "@/lib/blitz/questions";
import { getAnonServerSupabase } from "@/lib/supabase/server";

import { BlitzMatchView } from "./match-view";

export const dynamic = "force-dynamic";

export default async function BlitzMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/blitz/" + id);
  }

  const match = await fetchBlitzMatch(id);
  if (!match) notFound();
  if (![match.player_a, match.player_b].includes(userId)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
        <h1 className="text-2xl font-medium">This isn&apos;t your match.</h1>
        <p className="mt-2 text-muted">
          Only the two participants can view a Blitz arena.
        </p>
      </div>
    );
  }

  const youArePlayerA = match.player_a === userId;
  const yourPersonaSlug = youArePlayerA ? match.persona_a : match.persona_b;
  const oppPersonaSlug = youArePlayerA ? match.persona_b : match.persona_a;
  const yourPersona = yourPersonaSlug ? getPersona(yourPersonaSlug) : null;
  const oppPersona = oppPersonaSlug ? getPersona(oppPersonaSlug) : null;

  // Strip answer keys before sending the questions to the browser.
  const safeQuestions = (match.questions as unknown as BlitzQuestion[]).map(
    ({ q, choices }) => ({ q, choices }),
  );

  // Side-channel: fetch usernames so we can show "you vs <username>".
  const supabase = getAnonServerSupabase();
  const { data: profiles } = await supabase
    .from("users")
    .select("clerk_id, username, avatar_url")
    .in(
      "clerk_id",
      [match.player_a, match.player_b].filter((id): id is string => !!id),
    );
  const profileFor = (id: string | null) =>
    id ? profiles?.find((p) => p.clerk_id === id) ?? null : null;

  return (
    <BlitzMatchView
      matchId={match.id}
      youAreA={youArePlayerA}
      you={{
        clerkId: userId,
        persona: yourPersona && {
          slug: yourPersona.slug,
          name: yourPersona.name,
          tagline: yourPersona.tagline,
          accentColor: yourPersona.accentColor,
        },
        profile: profileFor(userId),
      }}
      opponent={{
        clerkId: youArePlayerA ? match.player_b : match.player_a,
        persona: oppPersona && {
          slug: oppPersona.slug,
          name: oppPersona.name,
          tagline: oppPersona.tagline,
          accentColor: oppPersona.accentColor,
        },
        profile: profileFor(youArePlayerA ? match.player_b : match.player_a),
      }}
      concept={{
        id: match.concept.id,
        title: match.concept.title,
        text: match.concept.text,
        difficulty: match.concept.difficulty,
      }}
      personas={ALL_PERSONAS.map((p) => ({
        slug: p.slug,
        name: p.name,
        accentColor: p.accentColor,
      }))}
      initialMatch={match}
      questions={safeQuestions}
    />
  );
}
