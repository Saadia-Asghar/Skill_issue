import { Show } from "@clerk/nextjs";

import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { getAnonServerSupabase } from "@/lib/supabase/server";
import type { PersonaRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getAnonServerSupabase();
  const { data: personas } = await supabase
    .from("personas")
    .select("id, slug, name, tagline, accent_color")
    .order("name", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      {/* ============================== HERO ============================== */}
      <section className="flex flex-col items-center text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--gold)",
            color: "var(--gold)",
            boxShadow: "0 4px 0 0 #9a7c00",
          }}
        >
          ★  The Cognitive Arena · v3
        </span>
        <h1 className="mt-8 max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
          Master any concept in your{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--lime), var(--accent-2) 50%, var(--accent))",
            }}
          >
            favorite influencer&apos;s
          </span>{" "}
          voice.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted">
          Professor Decompose maps which pedagogical style actually makes
          information stick — for you specifically — then turns retention into
          a globally ranked sport.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <ArcadeLink href="/colosseum" skin="lime" size="lg">
            ▶  Enter the Colosseum
          </ArcadeLink>
          <ArcadeLink href="/learn" skin="cyan" size="lg">
            Try the Synthesis Engine
          </ArcadeLink>
          <Show when="signed-out">
            <ArcadeLink href="/sign-up" skin="ghost" size="lg">
              Sign up
            </ArcadeLink>
          </Show>
          <Show when="signed-in">
            <ArcadeLink href="/dashboard" skin="ghost" size="lg">
              Dashboard
            </ArcadeLink>
          </Show>
        </div>
      </section>

      {/* ============================ THREE PILLARS ====================== */}
      <section className="mt-24 grid gap-5 sm:grid-cols-3">
        <Pillar
          eyebrow="System 01"
          accent="var(--accent)"
          icon="◉"
          title="Learning Fingerprint"
          body="Every quiz, vote, and 1v1 trains a private map of which persona clicks for which subject — visualized as a radar chart you actually want to share."
        />
        <Pillar
          eyebrow="System 03"
          accent="var(--accent-2)"
          icon="⚔"
          title="Comprehension Gauntlet"
          body="Three Socratic questions after every explanation. Wrong answers trigger a sharper, shorter re-explanation in the same persona's voice."
        />
        <Pillar
          eyebrow="The Daily Drop"
          accent="var(--gold)"
          icon="★"
          title="Cognitive Colosseum"
          body="A complex concept drops globally at midnight. Speed and accuracy move you up the Dean's List. 1v1 Blitz lets you steal Elo points from a stranger."
        />
      </section>

      {/* =========================== PERSONA ROSTER ====================== */}
      <section className="mt-24">
        <div className="flex items-end justify-between">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.4em]"
              style={{ color: "var(--gold)" }}
            >
              The Influencer Roster
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Pick your professor.
            </h2>
          </div>
          <span
            className="rounded-full border-2 px-3 py-1 font-mono text-[11px] font-bold"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--muted)",
            }}
          >
            {(personas ?? []).length} personas seeded
          </span>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(personas ?? []).map((p) => (
            <PersonaShowcase key={p.id} persona={p} />
          ))}
        </div>
      </section>

      {/* ============================ DATA MOAT ========================= */}
      <section className="mt-24">
        <GameCard skin="purple" className="p-8 sm:p-12">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{ color: "var(--gold)" }}
          >
            The Data Moat
          </p>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Every vote, match, and Elo fluctuation is{" "}
            <span style={{ color: "var(--lime)" }}>labeled training data</span>.
          </h2>
          <p className="mt-4 max-w-2xl text-base text-muted">
            We aren&apos;t just building an app. We&apos;re building the
            world&apos;s first proprietary dataset on human cognitive routing
            — what Duolingo spent a decade building for language, applied to
            all of academia.
          </p>
        </GameCard>
      </section>
    </div>
  );
}

function Pillar({
  eyebrow,
  title,
  body,
  icon,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: string;
  accent: string;
}) {
  return (
    <GameCard className="p-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold"
          style={{
            background: accent,
            color: "#1a0f00",
            border: "2px solid rgba(0,0,0,0.35)",
            boxShadow: "0 4px 0 0 rgba(0,0,0,0.4)",
          }}
        >
          {icon}
        </span>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {eyebrow}
        </p>
      </div>
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </GameCard>
  );
}

function PersonaShowcase({
  persona,
}: {
  persona: Pick<
    PersonaRow,
    "id" | "slug" | "name" | "tagline" | "accent_color"
  >;
}) {
  const color = persona.accent_color ?? "var(--accent)";
  const initials = persona.name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="game-card group relative overflow-hidden p-5 transition-transform hover:-translate-y-1"
      style={
        {
          "--shadow": color,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-base font-extrabold text-white"
          style={{
            background: color,
            border: "2px solid rgba(0,0,0,0.35)",
            boxShadow: "0 4px 0 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          {initials}
        </span>
        <h3 className="text-lg font-bold">{persona.name}</h3>
      </div>
      <p className="mt-3 text-sm text-muted">{persona.tagline}</p>
      <p
        className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ color }}
      >
        /{persona.slug}
      </p>
    </div>
  );
}
