"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ArcadeButton } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import {
  PersonaCard,
  type PersonaCardData,
} from "@/components/game/persona-card";
import { useBlitzMatchedListener } from "@/lib/realtime/client";
import { useSupabase } from "@/lib/supabase/browser";

type Phase = "pick" | "queueing" | "matched" | "error";

interface BlitzLobbyProps {
  personas: PersonaCardData[];
  userId: string;
}

export function BlitzLobby({ personas, userId }: BlitzLobbyProps) {
  const router = useRouter();
  const supabase = useSupabase();

  const [phase, setPhase] = useState<Phase>("pick");
  const [personaSlug, setPersonaSlug] = useState<string>(
    personas.find((p) => p.isCreator)?.slug ?? personas[0]?.slug ?? "",
  );
  const [waitedFor, setWaitedFor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const persona = personas.find((p) => p.slug === personaSlug) ?? null;
  const accent = persona?.accentColor ?? "var(--magenta)";

  useEffect(() => {
    if (phase !== "queueing") return;
    const start = Date.now();
    const id = window.setInterval(
      () => setWaitedFor(Math.floor((Date.now() - start) / 1000)),
      500,
    );
    return () => window.clearInterval(id);
  }, [phase]);

  useBlitzMatchedListener(supabase, userId, (matchId) => {
    setPhase("matched");
    router.push(`/blitz/${matchId}`);
  });

  const findMatch = useCallback(async () => {
    if (!persona) return;
    setError(null);
    setPhase("queueing");
    try {
      const res = await fetch("/api/blitz/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaSlug: persona.slug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status === "matched" && json.matchId) {
        setPhase("matched");
        router.push(`/blitz/${json.matchId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enter queue");
      setPhase("error");
    }
  }, [persona, router]);

  const cancel = useCallback(async () => {
    await fetch("/api/blitz/queue", { method: "DELETE" }).catch(() => null);
    setPhase("pick");
    setWaitedFor(0);
  }, []);

  const heroes = personas.filter((p) => p.isCreator);
  const others = personas.filter((p) => !p.isCreator);

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <GameCard className="p-6">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--gold)" }}
        >
          ◐ character select
        </p>
        <h2 className="mt-2 text-2xl font-bold">Pick your professor</h2>
        <p className="mt-2 text-sm text-muted">
          Persona changes the explanation you study; the rapid-fire questions
          are the same for both players.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {heroes.map((p) => (
            <PersonaCard
              key={p.slug}
              persona={p}
              selected={personaSlug === p.slug}
              onSelect={(slug) => setPersonaSlug(slug)}
              disabled={phase === "queueing"}
            />
          ))}
        </div>
        {others.length > 0 && (
          <details className="mt-5 group">
            <summary
              className="cursor-pointer text-xs font-bold uppercase tracking-[0.3em] transition group-open:text-foreground"
              style={{ color: "var(--accent-2)" }}
            >
              + more archetypes
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {others.map((p) => (
                <PersonaCard
                  key={p.slug}
                  persona={p}
                  selected={personaSlug === p.slug}
                  onSelect={(slug) => setPersonaSlug(slug)}
                  disabled={phase === "queueing"}
                />
              ))}
            </div>
          </details>
        )}
      </GameCard>

      <GameCard
        skin={phase === "queueing" ? "magenta" : "ink"}
        className="flex flex-col gap-4 p-6"
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--magenta)" }}
        >
          ⚔ matchmaker ⚔
        </p>
        {phase === "queueing" ? (
          <div className="flex flex-col items-start gap-5 py-4">
            <div className="relative">
              <motion.span
                className="inline-block h-16 w-16 rounded-full border-4"
                style={{
                  borderColor: `${accent} transparent ${accent} transparent`,
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, ease: "linear", repeat: Infinity }}
              />
              <span
                aria-hidden
                className="pulse-gold absolute inset-0 rounded-full"
              />
            </div>
            <div>
              <p className="text-base font-bold">Searching for a worthy opponent...</p>
              <p
                className="mt-1 font-mono text-xs font-bold tabular-nums"
                style={{ color: accent }}
              >
                {waitedFor}s · scanning the SKIP-LOCKED queue
              </p>
            </div>
            <ArcadeButton
              type="button"
              onClick={cancel}
              skin="ghost"
              size="sm"
            >
              Cancel
            </ArcadeButton>
          </div>
        ) : phase === "matched" ? (
          <p
            className="text-base font-bold"
            style={{ color: "var(--lime)" }}
          >
            ✓ match found — entering arena…
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Click <span className="font-bold text-foreground">FIND MATCH</span>.
              We&apos;ll pair you with another waiter using SKIP-LOCKED so two
              people can never get matched to the same third player. Open this
              page in a second tab to test against yourself.
            </p>
            <ArcadeButton
              type="button"
              disabled={!persona}
              onClick={findMatch}
              skin="lime"
              size="lg"
              full
            >
              ⚔  FIND MATCH
            </ArcadeButton>
            {error && (
              <p
                className="rounded-xl border-2 px-3 py-2 text-xs font-bold"
                style={{
                  background:
                    "color-mix(in srgb, var(--magenta) 18%, transparent)",
                  borderColor: "var(--magenta)",
                  color: "var(--magenta)",
                }}
              >
                ! {error}
              </p>
            )}
          </>
        )}
      </GameCard>
    </div>
  );
}
