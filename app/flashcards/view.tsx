"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { intervalLabel } from "@/lib/flashcards/leitner";
import type { FlashcardWithConcept } from "@/lib/flashcards/queries";

type Boxes = Record<1 | 2 | 3 | 4 | 5, number>;

const BOX_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "var(--magenta)",
  2: "var(--tangerine)",
  3: "var(--gold)",
  4: "var(--accent-2)",
  5: "var(--lime)",
};

interface FlashcardsViewProps {
  initialDue: FlashcardWithConcept[];
  initialAll: FlashcardWithConcept[];
  initialBoxes: Boxes;
}

export function FlashcardsView({
  initialDue,
  initialAll,
  initialBoxes,
}: FlashcardsViewProps) {
  const [due, setDue] = useState(initialDue);
  const [all, setAll] = useState(initialAll);
  const [boxes, setBoxes] = useState<Boxes>(initialBoxes);
  const [activeIdx, setActiveIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const active = due[activeIdx] ?? null;

  const review = useCallback(
    async (verdict: "got_it" | "missed") => {
      if (!active || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/flashcards/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: active.id, verdict }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

        setDue((prev) => prev.filter((c) => c.id !== active.id));
        setAll((prev) =>
          prev.map((c) => (c.id === active.id ? { ...c, ...json.card } : c)),
        );
        setBoxes((prev) => {
          const next = { ...prev };
          const oldBox = active.box as 1 | 2 | 3 | 4 | 5;
          const newBox = json.card.box as 1 | 2 | 3 | 4 | 5;
          next[oldBox] = Math.max(0, next[oldBox] - 1);
          next[newBox] = (next[newBox] ?? 0) + 1;
          return next;
        });
        setFlipped(false);
        if (verdict === "missed") setShakeKey((k) => k + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Review failed");
      } finally {
        setBusy(false);
      }
    },
    [active, busy],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if ((e.key === "1" || e.key === "j") && flipped) {
        void review("missed");
      } else if ((e.key === "2" || e.key === "k") && flipped) {
        void review("got_it");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, flipped, review]);

  useEffect(() => {
    if (activeIdx >= due.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIdx(0);
    }
  }, [due.length, activeIdx]);

  const totalCards = useMemo(
    () => Object.values(boxes).reduce((a, b) => a + b, 0),
    [boxes],
  );

  const decks = useMemo(() => {
    const map = new Map<string, FlashcardWithConcept[]>();
    for (const c of all) {
      const key = c.concept?.id ?? "no-concept";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, cards]) => ({
      key,
      title: cards[0].concept?.title ?? "Free play",
      cards,
    }));
  }, [all]);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-5">
        {([1, 2, 3, 4, 5] as const).map((b) => (
          <BoxStat key={b} box={b} count={boxes[b] ?? 0} />
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            ▶ Due today
            <span
              className="ml-3 rounded-full border-2 px-3 py-1 text-xs font-bold tabular-nums"
              style={{
                background: "var(--surface)",
                borderColor: "var(--lime)",
                color: "var(--lime)",
              }}
            >
              {due.length} CARDS
            </span>
          </h2>
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
            total: {totalCards}
          </span>
        </div>

        {error && (
          <div
            className="mb-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
            style={{
              background:
                "color-mix(in srgb, var(--magenta) 18%, transparent)",
              borderColor: "var(--magenta)",
              color: "var(--magenta)",
            }}
          >
            ! {error}
          </div>
        )}

        {active ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 30, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
            >
              <motion.div
                key={shakeKey}
                animate={
                  shakeKey > 0
                    ? {
                        x: [0, -14, 14, -10, 10, -5, 5, 0],
                        rotate: [0, -1, 1, -0.6, 0.6, -0.3, 0.3, 0],
                      }
                    : { x: 0 }
                }
                transition={{ duration: 0.45 }}
              >
                <ReviewCard
                  card={active}
                  flipped={flipped}
                  onFlip={() => setFlipped(!flipped)}
                  onMissed={() => void review("missed")}
                  onGotIt={() => void review("got_it")}
                  disabled={busy}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <GameCard skin="lime" pulse className="p-10 text-center">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.5em]"
              style={{ color: "var(--gold)" }}
            >
              ✓ ALL CAUGHT UP ✓
            </p>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight">
              No cards due. Run a Colosseum drop to forge new ones.
            </h3>
            <div className="mt-6 flex justify-center">
              <ArcadeLink href="/colosseum" skin="lime" size="lg">
                ▶ OPEN COLOSSEUM
              </ArcadeLink>
            </div>
          </GameCard>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold">⌘ Decks</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <GameCard key={deck.key} className="p-5">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: "var(--gold)" }}
              >
                ✦ {deck.cards.length} cards
              </p>
              <h3 className="mt-1 text-lg font-bold">{deck.title}</h3>
              <div className="mt-3 flex gap-1">
                {([1, 2, 3, 4, 5] as const).map((b) => {
                  const count = deck.cards.filter((c) => c.box === b).length;
                  const pct = (count / Math.max(1, deck.cards.length)) * 100;
                  return (
                    <span
                      key={b}
                      className="h-2 flex-1 rounded-full border border-black/40"
                      style={{
                        background: BOX_COLORS[b],
                        opacity: pct > 0 ? 1 : 0.18,
                      }}
                      title={`Box ${b}: ${count} cards`}
                    />
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                Personas:{" "}
                {Array.from(
                  new Set(deck.cards.map((c) => c.persona_slug)),
                ).join(", ")}
              </p>
            </GameCard>
          ))}
          {decks.length === 0 && (
            <p className="text-sm text-muted">No decks yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function BoxStat({
  box,
  count,
}: {
  box: 1 | 2 | 3 | 4 | 5;
  count: number;
}) {
  const color = BOX_COLORS[box];
  return (
    <div
      className="rounded-2xl border-2 px-4 py-3"
      style={{
        background: "var(--surface)",
        borderColor: "rgba(0,0,0,0.35)",
        boxShadow: `0 5px 0 0 ${color}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ color }}
      >
        ▣ box {box} · {intervalLabel(box)}
      </p>
      <p
        className="mt-1 text-3xl font-extrabold tabular-nums"
        style={{ color }}
      >
        {count}
      </p>
    </div>
  );
}

function ReviewCard({
  card,
  flipped,
  onFlip,
  onMissed,
  onGotIt,
  disabled,
}: {
  card: FlashcardWithConcept;
  flipped: boolean;
  onFlip: () => void;
  onMissed: () => void;
  onGotIt: () => void;
  disabled: boolean;
}) {
  const boxColor = BOX_COLORS[card.box as 1 | 2 | 3 | 4 | 5] ?? "var(--lime)";
  return (
    <GameCard skin={flipped ? "purple" : "cyan"} className="overflow-hidden">
      <div className="flex flex-col gap-3 px-6 pt-6">
        <div className="flex items-center justify-between text-xs">
          <span
            className="rounded-full border-2 px-3 py-1 font-bold uppercase tracking-[0.3em]"
            style={{
              background: "var(--surface)",
              borderColor: boxColor,
              color: boxColor,
            }}
          >
            ▣ box {card.box} · {intervalLabel(card.box)}
          </span>
          <span className="text-xs font-bold text-muted">
            {card.concept?.title ?? "Free play"} · {card.persona_slug}
          </span>
        </div>
        <motion.button
          type="button"
          onClick={onFlip}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="flex min-h-[220px] flex-col justify-center rounded-2xl border-2 px-6 py-8 text-left transition"
          style={{
            background: "var(--surface)",
            borderColor: "rgba(0,0,0,0.4)",
            boxShadow: `0 6px 0 0 ${flipped ? "var(--accent)" : "var(--accent-2)"}`,
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={flipped ? "back" : "front"}
              initial={{ opacity: 0, rotateY: -90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 90 }}
              transition={{ duration: 0.35 }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.4em]"
                style={{ color: flipped ? "var(--accent)" : "var(--accent-2)" }}
              >
                {flipped ? "▼ ANSWER" : "▶ QUESTION"}
              </p>
              <p className="mt-3 text-2xl font-bold leading-relaxed text-foreground">
                {flipped ? card.back : card.front}
              </p>
            </motion.div>
          </AnimatePresence>
          <p
            className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--gold)" }}
          >
            ⎵ space=flip · 1=missed · 2=got it
          </p>
        </motion.button>
      </div>
      <div className="flex items-center justify-end gap-3 border-t-2 border-black/30 px-6 py-4">
        <ArcadeButton
          type="button"
          onClick={onMissed}
          disabled={disabled || !flipped}
          skin="magenta"
          size="sm"
        >
          ✗ Missed
        </ArcadeButton>
        <ArcadeButton
          type="button"
          onClick={onGotIt}
          disabled={disabled || !flipped}
          skin="lime"
          size="sm"
        >
          ✓ Got it
        </ArcadeButton>
      </div>
    </GameCard>
  );
}
