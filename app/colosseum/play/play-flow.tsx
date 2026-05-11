"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DifficultyPip } from "@/components/colosseum/difficulty-pip";
import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { FloatingDelta } from "@/components/game/floating-delta";
import { GameCard } from "@/components/game/game-card";
import { PersonaCard, type PersonaCardData } from "@/components/game/persona-card";

type Phase =
  | "pick"
  | "explaining"
  | "ready"
  | "gauntlet"
  | "submitting"
  | "done";

interface ServerQuestion {
  id: number;
  q: string;
  choices: string[];
}

interface AnswerResult {
  correct: boolean;
  correct_index: number;
  correct_choice: string;
  your_choice: string | null;
  gotcha: string;
}

interface SubmitResponse {
  summary: {
    correct: number;
    total: number;
    elapsed_seconds: number;
    performance: number;
    is_ranked: boolean;
    elo: { before: number; after: number; delta: number };
    xp: {
      studied: number;
      accuracy: number;
      perfect: number;
      dailyBonus: number;
      streakBonus: number;
      total: number;
    };
    streak: {
      before: number;
      after: number;
      changed: boolean;
      milestone: boolean;
    };
    leaderboard: { rank: number } | null;
    flashcards_forged?: number;
  };
}

interface ColosseumPlayProps {
  dropDate: string;
  conceptTitle: string;
  conceptText: string | null;
  conceptDifficulty: number | null;
  personas: PersonaCardData[];
  creatorSlugs: string[];
}

export function ColosseumPlay({
  dropDate,
  conceptTitle,
  conceptText,
  conceptDifficulty,
  personas,
  creatorSlugs,
}: ColosseumPlayProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [personaSlug, setPersonaSlug] = useState<string>(
    creatorSlugs[0] ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const [explanation, setExplanation] = useState("");
  const [streamingExplanation, setStreamingExplanation] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ServerQuestion[]>([]);
  const [activeQ, setActiveQ] = useState(0);
  const [results, setResults] = useState<Record<number, AnswerResult>>({});
  const [reExplanations, setReExplanations] = useState<Record<number, string>>(
    {},
  );
  const [streamingReExplain, setStreamingReExplain] = useState<number | null>(
    null,
  );
  const [shakeKey, setShakeKey] = useState(0);

  const [gauntletStartedAt, setGauntletStartedAt] = useState<number | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [submitResponse, setSubmitResponse] = useState<SubmitResponse | null>(
    null,
  );

  const persona = useMemo(
    () => personas.find((p) => p.slug === personaSlug) ?? null,
    [personas, personaSlug],
  );
  const accent = persona?.accentColor ?? "var(--lime)";

  const startedRef = useRef(false);

  useEffect(() => {
    if (phase !== "gauntlet") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const elapsedSeconds = useMemo(() => {
    if (!gauntletStartedAt) return 0;
    return Math.max(0, Math.floor((now - gauntletStartedAt) / 1000));
  }, [now, gauntletStartedAt]);

  const startExplanation = useCallback(async () => {
    if (!conceptText || !personaSlug || startedRef.current) return;
    startedRef.current = true;
    setError(null);
    setExplanation("");
    setPhase("explaining");
    setStreamingExplanation(true);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: conceptText, personaSlug }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setExplanation(buf);
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Explanation failed");
      setPhase("pick");
      startedRef.current = false;
    } finally {
      setStreamingExplanation(false);
    }
  }, [conceptText, personaSlug]);

  const enterGauntlet = useCallback(async () => {
    if (!personaSlug) return;
    setError(null);
    setPhase("gauntlet");

    try {
      const res = await fetch("/api/colosseum/drop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaSlug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setSessionId(json.sessionId);
      setQuestions(json.questions);
      setActiveQ(0);
      setResults({});
      setReExplanations({});
      setGauntletStartedAt(Date.now());
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the gauntlet");
      setPhase("ready");
    }
  }, [personaSlug]);

  const submitAnswer = useCallback(
    async (choice: number) => {
      if (!sessionId || results[activeQ]) return;
      const res = await fetch("/api/gauntlet/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: activeQ, choice }),
      });
      const json: AnswerResult & { error?: string } = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setResults((prev) => ({ ...prev, [activeQ]: json }));
      if (!json.correct) setShakeKey((k) => k + 1);
    },
    [sessionId, activeQ, results],
  );

  const requestReExplanation = useCallback(async () => {
    if (!sessionId) return;
    const result = results[activeQ];
    if (!result) return;
    const userIdx = result.your_choice
      ? questions[activeQ].choices.indexOf(result.your_choice)
      : -1;

    setReExplanations((prev) => ({ ...prev, [activeQ]: "" }));
    setStreamingReExplain(activeQ);

    try {
      const res = await fetch("/api/gauntlet/re-explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: activeQ,
          userChoice: userIdx,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setReExplanations((prev) => ({ ...prev, [activeQ]: buf }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-explanation failed");
    } finally {
      setStreamingReExplain(null);
    }
  }, [sessionId, activeQ, results, questions]);

  const finalize = useCallback(async () => {
    if (!sessionId) return;
    setPhase("submitting");
    try {
      const res = await fetch("/api/colosseum/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSubmitResponse(json);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
      setPhase("gauntlet");
    }
  }, [sessionId]);

  const advance = useCallback(() => {
    if (activeQ + 1 >= questions.length) {
      void finalize();
    } else {
      setActiveQ(activeQ + 1);
    }
  }, [activeQ, questions.length, finalize]);

  const correctCount = Object.values(results).filter((r) => r.correct).length;

  return (
    <div className="flex flex-col gap-6">
      <Header
        dropDate={dropDate}
        conceptTitle={conceptTitle}
        conceptDifficulty={conceptDifficulty}
        elapsedSeconds={elapsedSeconds}
        showTimer={phase === "gauntlet"}
      />

      {error && (
        <div
          className="rounded-2xl border-2 px-4 py-3 text-sm font-bold"
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

      {phase === "pick" && (
        <PickStep
          conceptText={conceptText}
          personas={personas}
          personaSlug={personaSlug}
          onSelect={setPersonaSlug}
          onBegin={startExplanation}
          personaName={persona?.name ?? "—"}
        />
      )}

      {(phase === "explaining" || phase === "ready") && (
        <ExplanationCard
          persona={persona}
          accent={accent}
          explanation={explanation}
          streaming={streamingExplanation}
          ready={phase === "ready"}
          onEnter={enterGauntlet}
        />
      )}

      {phase === "gauntlet" && persona && questions.length > 0 && (
        <GauntletStep
          persona={persona}
          accent={accent}
          questions={questions}
          activeQ={activeQ}
          result={results[activeQ] ?? null}
          reExplanation={reExplanations[activeQ] ?? ""}
          streamingReExplain={streamingReExplain === activeQ}
          onSubmit={submitAnswer}
          onReExplain={requestReExplanation}
          onAdvance={advance}
          correctSoFar={correctCount}
          shakeKey={shakeKey}
        />
      )}

      {phase === "submitting" && (
        <GameCard className="p-10 text-center">
          <p className="text-base text-muted">Locking in your run...</p>
        </GameCard>
      )}

      {phase === "done" && submitResponse && (
        <ResultCard data={submitResponse} accent={accent} />
      )}
    </div>
  );
}

function Header({
  dropDate,
  conceptTitle,
  conceptDifficulty,
  elapsedSeconds,
  showTimer,
}: {
  dropDate: string;
  conceptTitle: string;
  conceptDifficulty: number | null;
  elapsedSeconds: number;
  showTimer: boolean;
}) {
  const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const s = String(elapsedSeconds % 60).padStart(2, "0");
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className="rounded-full border-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--gold)",
            color: "var(--gold)",
          }}
        >
          ◆ DAILY DROP · {dropDate}
        </span>
        {showTimer && (
          <span
            className="rounded-xl border-2 bg-surface px-3 py-1 font-mono text-base font-extrabold tabular-nums"
            style={{
              borderColor: "var(--magenta)",
              color: "var(--magenta)",
              boxShadow: "0 4px 0 0 var(--magenta)",
            }}
          >
            {m}:{s}
          </span>
        )}
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {conceptTitle}
      </h1>
      {conceptDifficulty !== null && (
        <DifficultyPip difficulty={conceptDifficulty} />
      )}
    </header>
  );
}

function PickStep({
  conceptText,
  personas,
  personaSlug,
  onSelect,
  onBegin,
  personaName,
}: {
  conceptText: string | null;
  personas: PersonaCardData[];
  personaSlug: string;
  onSelect: (s: string) => void;
  onBegin: () => void;
  personaName: string;
}) {
  const creators = personas.filter((p) => p.isCreator);
  const others = personas.filter((p) => !p.isCreator);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <GameCard className="p-6">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--gold)" }}
        >
          ◇ the concept
        </p>
        <article className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-foreground/95">
          {conceptText ??
            "The drop hasn't been generated yet. Once you press Begin, the server will create today's questions and start your run."}
        </article>
      </GameCard>

      <GameCard skin="purple" className="flex flex-col gap-4 p-6">
        <div>
          <p className="text-sm font-bold">Pick your professor</p>
          <p className="mt-1 text-xs text-muted">
            Persona changes the explanation voice. The 3 gauntlet questions
            are the same for every player.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {creators.map((p) => (
            <PersonaCard
              key={p.slug}
              persona={p}
              selected={personaSlug === p.slug}
              onSelect={onSelect}
              variant="compact"
            />
          ))}
        </div>
        <details className="group">
          <summary
            className="cursor-pointer text-xs font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--accent-2)" }}
          >
            + {others.length} more archetypes
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((p) => (
              <PersonaCard
                key={p.slug}
                persona={p}
                selected={personaSlug === p.slug}
                onSelect={onSelect}
                variant="compact"
              />
            ))}
          </div>
        </details>

        <ArcadeButton
          type="button"
          disabled={!personaSlug || !conceptText}
          onClick={onBegin}
          skin="lime"
          size="lg"
          full
          className="mt-2"
        >
          ▶ BEGIN RUN WITH {personaName.toUpperCase()}
        </ArcadeButton>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--gold)" }}
        >
          ⏱ timer starts when you enter the gauntlet, not now.
        </p>
      </GameCard>
    </div>
  );
}

function ExplanationCard({
  persona,
  accent,
  explanation,
  streaming,
  ready,
  onEnter,
}: {
  persona: PersonaCardData | null;
  accent: string;
  explanation: string;
  streaming: boolean;
  ready: boolean;
  onEnter: () => void;
}) {
  const initials =
    persona?.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "??";
  return (
    <GameCard skin="cyan" className="p-6">
      <div className="mb-4 flex items-center gap-3">
        {persona && (
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold text-white"
            style={{
              background: persona.accentColor,
              border: "2px solid rgba(0,0,0,0.4)",
              boxShadow:
                "0 3px 0 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            {initials}
          </span>
        )}
        <div>
          <p className="text-sm font-bold">{persona?.name}</p>
          <p className="text-xs text-muted">{persona?.tagline}</p>
        </div>
      </div>
      <article
        className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border-2 p-5 text-[15px] leading-7 text-foreground/95"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {explanation}
        {streaming && (
          <span
            className="ml-1 inline-block h-4 w-2 -translate-y-0.5 animate-pulse"
            style={{ background: accent }}
          />
        )}
      </article>
      <div className="mt-6 flex items-center gap-3">
        <ArcadeButton
          type="button"
          disabled={!ready}
          onClick={onEnter}
          skin="magenta"
          size="lg"
        >
          {ready
            ? "⚔ ENTER THE GAUNTLET — CLOCK STARTS NOW"
            : "STREAMING EXPLANATION..."}
        </ArcadeButton>
      </div>
    </GameCard>
  );
}

function GauntletStep({
  persona,
  accent,
  questions,
  activeQ,
  result,
  reExplanation,
  streamingReExplain,
  onSubmit,
  onReExplain,
  onAdvance,
  correctSoFar,
  shakeKey,
}: {
  persona: PersonaCardData;
  accent: string;
  questions: ServerQuestion[];
  activeQ: number;
  result: AnswerResult | null;
  reExplanation: string;
  streamingReExplain: boolean;
  onSubmit: (c: number) => void;
  onReExplain: () => void;
  onAdvance: () => void;
  correctSoFar: number;
  shakeKey: number;
}) {
  const q = questions[activeQ];
  const total = questions.length;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeQ}
        initial={{ opacity: 0, y: 40, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        <motion.div
          key={shakeKey}
          animate={
            shakeKey > 0
              ? {
                  x: [0, -16, 16, -12, 12, -6, 6, 0],
                  rotate: [0, -1.2, 1.2, -0.8, 0.8, -0.4, 0.4, 0],
                }
              : { x: 0 }
          }
          transition={{ duration: 0.45 }}
        >
          <GameCard skin="ink" className="p-6">
            <div className="mb-5 flex items-center justify-between text-xs">
              <span
                className="rounded-full border-2 px-3 py-1 font-bold uppercase tracking-[0.3em]"
                style={{
                  background: "var(--surface)",
                  borderColor: accent,
                  color: accent,
                }}
              >
                ⚔ Q{activeQ + 1} / {total}
              </span>
              <span className="text-muted">
                Correct so far:{" "}
                <span
                  className="font-mono font-extrabold tabular-nums"
                  style={{ color: "var(--lime)" }}
                >
                  {correctSoFar}
                </span>{" "}
                / {total}
              </span>
            </div>
            <h3 className="text-2xl font-bold leading-snug sm:text-3xl">
              {q.q}
            </h3>
            <div className="mt-6 grid gap-3">
              {q.choices.map((choice, i) => {
                const isCorrect = result && i === result.correct_index;
                const isYours =
                  result &&
                  result.your_choice &&
                  choice === result.your_choice;
                const cardColor = isCorrect
                  ? "var(--lime)"
                  : isYours && !isCorrect
                    ? "var(--magenta)"
                    : "var(--border)";
                return (
                  <motion.button
                    key={i}
                    type="button"
                    onClick={() => onSubmit(i)}
                    disabled={!!result}
                    whileHover={result ? undefined : { scale: 1.02, y: -2 }}
                    whileTap={result ? undefined : { scale: 0.98 }}
                    className="group flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-base font-bold transition disabled:cursor-default"
                    style={{
                      background: isCorrect
                        ? "color-mix(in srgb, var(--lime) 28%, var(--surface))"
                        : isYours && !isCorrect
                          ? "color-mix(in srgb, var(--magenta) 22%, var(--surface))"
                          : "var(--surface)",
                      borderColor: cardColor,
                      boxShadow: `0 5px 0 0 ${cardColor}`,
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 font-extrabold"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--gold)",
                        borderColor: "rgba(0,0,0,0.4)",
                      }}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{choice}</span>
                    {isCorrect && (
                      <span
                        className="text-xs font-bold uppercase tracking-[0.2em]"
                        style={{ color: "var(--lime)" }}
                      >
                        ✓ correct
                      </span>
                    )}
                    {isYours && !isCorrect && (
                      <span
                        className="text-xs font-bold uppercase tracking-[0.2em]"
                        style={{ color: "var(--magenta)" }}
                      >
                        ✗ your pick
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
            {result && (
              <div
                className="mt-6 flex flex-col gap-3 rounded-2xl border-2 p-5"
                style={{
                  background: "var(--surface)",
                  borderColor: result.correct
                    ? "var(--lime)"
                    : "var(--magenta)",
                  boxShadow: `0 5px 0 0 ${result.correct ? "var(--lime)" : "var(--magenta)"}`,
                }}
              >
                <div className="flex items-center gap-2 text-base font-bold">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      background: result.correct
                        ? "var(--lime)"
                        : "var(--magenta)",
                      boxShadow: `0 0 12px 0 ${result.correct ? "var(--lime)" : "var(--magenta)"}`,
                    }}
                  />
                  <span>
                    {result.correct ? "Nailed it." : "Missed."}
                  </span>
                  <span className="text-xs text-muted">— {result.gotcha}</span>
                </div>
                {!result.correct && (
                  <>
                    {!reExplanation && !streamingReExplain && (
                      <ArcadeButton
                        type="button"
                        onClick={onReExplain}
                        skin="ghost"
                        size="sm"
                        className="self-start"
                      >
                        ◐ Sharper re-explanation in {persona.name}&apos;s voice
                      </ArcadeButton>
                    )}
                    {(reExplanation || streamingReExplain) && (
                      <div
                        className="rounded-xl border-2 px-4 py-3 text-sm leading-relaxed text-foreground/95"
                        style={{
                          background: "var(--surface-2)",
                          borderColor: "var(--border)",
                        }}
                      >
                        <p
                          className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em]"
                          style={{ color: persona.accentColor }}
                        >
                          {persona.name} — re-explanation
                        </p>
                        <p className="whitespace-pre-wrap">
                          {reExplanation}
                          {streamingReExplain && (
                            <span
                              className="ml-1 inline-block h-3.5 w-1.5 -translate-y-0.5 animate-pulse"
                              style={{ background: accent }}
                            />
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <ArcadeButton
                  type="button"
                  onClick={onAdvance}
                  skin={result.correct ? "lime" : "cyan"}
                  size="md"
                  className="self-end"
                >
                  {activeQ + 1 >= total ? "▶ LOCK IN RUN" : "▶ NEXT QUESTION"}
                </ArcadeButton>
              </div>
            )}
          </GameCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ResultCard({
  data,
  accent,
}: {
  data: SubmitResponse;
  accent: string;
}) {
  const { summary } = data;
  const eloPositive = summary.elo.delta > 0;
  const eloZero = summary.elo.delta === 0;
  const perfect = summary.correct === summary.total;

  return (
    <div className="relative">
      {/* floating delta over the result */}
      {!eloZero && (
        <FloatingDelta
          triggerKey={`elo-${summary.elo.delta}`}
          amount={summary.elo.delta}
          kind={eloPositive ? "elo-up" : "elo-down"}
        />
      )}
      {summary.xp.total > 0 && (
        <FloatingDelta
          triggerKey={`xp-${summary.xp.total}`}
          amount={summary.xp.total}
          kind="xp"
          className="-translate-y-16"
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        <GameCard
          skin={perfect ? "lime" : eloPositive ? "default" : "magenta"}
          pulse={perfect}
          className="p-7"
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ◆ run complete ◆
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <BigStat
              label={summary.is_ranked ? "RANKED" : "UNRANKED"}
              value={`${summary.correct} / ${summary.total}`}
              sub={`in ${summary.elapsed_seconds}s · perf ${summary.performance.toFixed(2)}`}
              accent={accent}
            />
            <BigStat
              label="ELO"
              value={
                eloZero
                  ? `${summary.elo.before}`
                  : `${eloPositive ? "+" : ""}${summary.elo.delta}`
              }
              sub={
                eloZero
                  ? summary.is_ranked
                    ? "no change"
                    : "unranked"
                  : `${summary.elo.before} → ${summary.elo.after}`
              }
              accent={
                eloZero
                  ? "var(--muted)"
                  : eloPositive
                    ? "var(--lime)"
                    : "var(--magenta)"
              }
            />
            <BigStat
              label="XP"
              value={`+${summary.xp.total}`}
              sub={xpBreakdown(summary.xp)}
              accent="var(--gold)"
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div
              className="rounded-2xl border-2 p-4"
              style={{
                background: "var(--surface)",
                borderColor: "rgba(0,0,0,0.35)",
                boxShadow: "0 4px 0 0 var(--tangerine)",
              }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: "var(--tangerine)" }}
              >
                🔥 streak
              </p>
              <p className="mt-1 text-xl font-bold">
                {summary.streak.before}d → {summary.streak.after}d{" "}
                {summary.streak.milestone && (
                  <span
                    className="ml-2 text-xs"
                    style={{ color: "var(--gold)" }}
                  >
                    ★ 7-DAY MILESTONE
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {summary.streak.changed
                  ? "Daily Drop kept your streak alive."
                  : "Streak unchanged — already counted today."}
              </p>
            </div>
            <div
              className="rounded-2xl border-2 p-4"
              style={{
                background: "var(--surface)",
                borderColor: "rgba(0,0,0,0.35)",
                boxShadow: "0 4px 0 0 var(--gold)",
              }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: "var(--gold)" }}
              >
                ★ dean&apos;s list
              </p>
              {summary.leaderboard ? (
                <p className="mt-1 text-xl font-bold">
                  You&apos;re now{" "}
                  <span
                    className="font-mono"
                    style={{ color: "var(--gold)" }}
                  >
                    #{summary.leaderboard.rank}
                  </span>{" "}
                  globally.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Position unavailable.</p>
              )}
              <Link
                href="/colosseum/deans-list"
                className="mt-2 inline-flex text-xs font-bold underline-offset-2 hover:underline"
                style={{ color: "var(--lime)" }}
              >
                see top 500 →
              </Link>
            </div>
          </div>

          {summary.flashcards_forged && summary.flashcards_forged > 0 ? (
            <div
              className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
              style={{
                background:
                  "color-mix(in srgb, var(--accent-2) 22%, transparent)",
                borderColor: "var(--accent-2)",
                boxShadow: "0 4px 0 0 var(--accent-2)",
              }}
            >
              ✦ Forged{" "}
              <span style={{ color: "var(--accent-2)" }}>
                {summary.flashcards_forged} flashcard
                {summary.flashcards_forged === 1 ? "" : "s"}
              </span>{" "}
              in your best persona&apos;s voice.{" "}
              <Link
                href="/flashcards"
                className="underline-offset-2 hover:underline"
                style={{ color: "var(--lime)" }}
              >
                review now →
              </Link>
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
            <ArcadeLink href="/colosseum" skin="ghost" size="md">
              Back to Colosseum
            </ArcadeLink>
            <ArcadeLink href="/dashboard" skin="lime" size="md">
              ▶ View dashboard
            </ArcadeLink>
          </div>
        </GameCard>
      </motion.div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl border-2 px-4 py-4"
      style={{
        background: "var(--surface)",
        borderColor: "rgba(0,0,0,0.35)",
        boxShadow: `0 5px 0 0 ${accent}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-3xl font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

function xpBreakdown(xp: SubmitResponse["summary"]["xp"]): string {
  const parts: string[] = [];
  if (xp.studied > 0) parts.push(`${xp.studied} studied`);
  if (xp.accuracy > 0) parts.push(`${xp.accuracy} accuracy`);
  if (xp.perfect > 0) parts.push(`${xp.perfect} perfect`);
  if (xp.dailyBonus > 0) parts.push(`${xp.dailyBonus} drop`);
  if (xp.streakBonus > 0) parts.push(`${xp.streakBonus} streak`);
  return parts.join(" · ");
}
