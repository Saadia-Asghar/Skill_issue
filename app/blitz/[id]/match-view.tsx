"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { FloatingDelta } from "@/components/game/floating-delta";
import { GameCard } from "@/components/game/game-card";
import { HealthBar } from "@/components/game/health-bar";
import {
  BLITZ_QUESTION_SECONDS,
  BLITZ_STUDY_SECONDS,
} from "@/lib/realtime/constants";
import {
  useBlitzMatchSubscription,
  useTick,
} from "@/lib/realtime/client";
import { primeSlangSpeech, speakSlangVerdict } from "@/lib/speech/slang-tts";
import { useSupabase } from "@/lib/supabase/browser";
import type { BlitzMatchRow } from "@/lib/supabase/types";

type PersonaCardLite = {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
};
type ProfileLite = {
  clerk_id: string;
  username: string | null;
  avatar_url: string | null;
} | null;
type Side = {
  clerkId: string | null;
  persona: PersonaCardLite | null;
  profile: ProfileLite;
};
type ConceptLite = {
  id: string;
  title: string;
  text: string;
  difficulty: number;
};
type SafeQuestion = { q: string; choices: string[] };

interface Props {
  matchId: string;
  youAreA: boolean;
  you: Side;
  opponent: Side;
  concept: ConceptLite;
  personas: { slug: string; name: string; accentColor: string }[];
  initialMatch: BlitzMatchRow;
  questions: SafeQuestion[];
}

const TARGET_CORRECT = 3;

export function BlitzMatchView({
  matchId,
  youAreA,
  you,
  opponent,
  concept,
  personas,
  initialMatch,
  questions,
}: Props) {
  const supabase = useSupabase();
  const match =
    useBlitzMatchSubscription(supabase, matchId, initialMatch) ?? initialMatch;

  const youAccent = you.persona?.accentColor ?? "var(--lime)";
  const oppAccent = opponent.persona?.accentColor ?? "var(--magenta)";

  const [explanation, setExplanation] = useState("");
  const [streamingExplain, setStreamingExplain] = useState(false);
  const explainStartedRef = useRef(false);

  const [submittedQ, setSubmittedQ] = useState<Record<number, number>>({});
  const [slangVerdicts, setSlangVerdicts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Animation triggers — change to fire animations once.
  const [shakeKey, setShakeKey] = useState(0);

  const tick = useTick(250, match.state === "STUDY" || match.state === "BLITZ");

  /* ----------- STUDY: stream the persona explanation ----------- */
  useEffect(() => {
    if (match.state !== "STUDY") return;
    if (explainStartedRef.current) return;
    if (!you.persona) return;

    explainStartedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExplanation("");
    setStreamingExplain(true);
    (async () => {
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: concept.text,
            personaSlug: you.persona!.slug,
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
          setExplanation(buf);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Explanation failed");
      } finally {
        setStreamingExplain(false);
      }
    })();
  }, [match.state, concept.text, you.persona]);

  /* ---------- Study clock + auto transition to Blitz ----------- */
  const studyRemaining = useMemo(() => {
    if (!match.study_started_at) return BLITZ_STUDY_SECONDS;
    const startMs = new Date(match.study_started_at).getTime();
    const elapsed = Math.floor((tick - startMs) / 1000);
    return Math.max(0, BLITZ_STUDY_SECONDS - elapsed);
  }, [match.study_started_at, tick]);

  const startBlitz = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/blitz/${matchId}/start`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? `HTTP ${res.status}`);
    }
  }, [matchId]);

  const triggeredAutoStartRef = useRef(false);
  useEffect(() => {
    if (match.state !== "STUDY") {
      triggeredAutoStartRef.current = false;
      return;
    }
    if (studyRemaining > 0) return;
    if (triggeredAutoStartRef.current) return;
    triggeredAutoStartRef.current = true;
    void startBlitz();
  }, [match.state, studyRemaining, startBlitz]);

  /* ----------- Blitz question clock ------------ */
  const qRemaining = useMemo(() => {
    if (!match.q_started_at || match.state !== "BLITZ")
      return BLITZ_QUESTION_SECONDS;
    const startMs = new Date(match.q_started_at).getTime();
    const elapsed = Math.floor((tick - startMs) / 1000);
    return Math.max(0, BLITZ_QUESTION_SECONDS - elapsed);
  }, [match.q_started_at, match.state, tick]);

  const submitAnswer = useCallback(
    async (choice: number) => {
      if (match.state !== "BLITZ") return;
      if (submittedQ[match.current_q] !== undefined) return;
      primeSlangSpeech();
      setSubmittedQ((prev) => ({ ...prev, [match.current_q]: choice }));
      const res = await fetch(`/api/blitz/${matchId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionIndex: match.current_q, choice }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setSubmittedQ((prev) => {
          const next = { ...prev };
          delete next[match.current_q];
          return next;
        });
      } else if (typeof json.slang_verdict === "string") {
        setSlangVerdicts((prev) => ({
          ...prev,
          [match.current_q]: json.slang_verdict,
        }));
        speakSlangVerdict({
          verdict: json.slang_verdict,
          isCorrect: Boolean(json.correct),
          personaSlug: you.persona?.slug,
        });
      }
    },
    [matchId, match.current_q, match.state, submittedQ, you.persona?.slug],
  );

  // Per-question watchdog
  const forceTriggeredRef = useRef<number | null>(null);
  useEffect(() => {
    if (match.state !== "BLITZ") return;
    if (qRemaining > 0) return;
    if (forceTriggeredRef.current === match.current_q) return;
    forceTriggeredRef.current = match.current_q;
    fetch(`/api/blitz/${matchId}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true }),
    }).catch(() => null);
  }, [matchId, match.state, match.current_q, qRemaining]);

  /* -------------------------------- Render ------------------------------ */

  const yourCorrect = youAreA ? match.player_a_correct : match.player_b_correct;
  const oppCorrect = youAreA ? match.player_b_correct : match.player_a_correct;
  const finished = match.state === "FINISHED";
  const winner = match.winner;
  const youWon = !!winner && winner === you.clerkId;
  const youLost = !!winner && winner !== you.clerkId;
  const draw = finished && !winner;
  const yourEloDelta = youAreA
    ? (match.player_a_elo_after ?? 0) - (match.player_a_elo_before ?? 0)
    : (match.player_b_elo_after ?? 0) - (match.player_b_elo_before ?? 0);
  const xpDelta = youWon ? 25 : draw ? 5 : 0;
  const latestVerdict =
    slangVerdicts[2] ?? slangVerdicts[1] ?? slangVerdicts[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      {/* ============================ ARENA HUD ========================== */}
      <ArenaHud
        you={you}
        opponent={opponent}
        youAccent={youAccent}
        oppAccent={oppAccent}
        yourCorrect={yourCorrect}
        oppCorrect={oppCorrect}
        state={match.state}
        currentQ={match.current_q}
      />

      {error && (
        <div
          className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            background: "color-mix(in srgb, var(--magenta) 18%, transparent)",
            borderColor: "var(--magenta)",
            color: "var(--magenta)",
          }}
        >
          ! {error}
        </div>
      )}

      {match.state === "WAITING" && (
        <GameCard className="mt-6 p-10 text-center">
          <p className="text-base text-muted">Waiting for your partner...</p>
        </GameCard>
      )}

      {match.state === "STUDY" && (
        <StudyPanel
          accent={youAccent}
          persona={you.persona}
          conceptTitle={concept.title}
          explanation={explanation}
          streaming={streamingExplain}
          remaining={studyRemaining}
          onSkip={startBlitz}
        />
      )}

      {match.state === "BLITZ" && questions[match.current_q] && (
        <BlitzPanel
          accent={youAccent}
          conceptTitle={concept.title}
          questionIndex={match.current_q}
          question={questions[match.current_q]}
          remaining={qRemaining}
          mySubmittedChoice={submittedQ[match.current_q]}
          onAnswer={submitAnswer}
          totalQuestions={questions.length}
          shakeKey={shakeKey}
          onShake={() => setShakeKey((k) => k + 1)}
        />
      )}

      {finished && (
        <ResultPanel
          accent={
            youWon
              ? "var(--lime)"
              : youLost
                ? "var(--magenta)"
                : "var(--accent-2)"
          }
          eloDelta={yourEloDelta}
          xpDelta={xpDelta}
          eloBefore={
            youAreA ? match.player_a_elo_before : match.player_b_elo_before
          }
          eloAfter={
            youAreA ? match.player_a_elo_after : match.player_b_elo_after
          }
          you={you}
          opponent={opponent}
          yourCorrect={yourCorrect}
          oppCorrect={oppCorrect}
          outcome={youWon ? "win" : youLost ? "loss" : draw ? "draw" : "tie"}
          slangVerdict={latestVerdict}
        />
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 text-xs text-muted">
        <div>
          You picked{" "}
          <span style={{ color: youAccent }} className="font-bold">
            {you.persona?.name ?? "—"}
          </span>
          .
        </div>
        <div className="text-right">
          Opponent picked{" "}
          <span style={{ color: oppAccent }} className="font-bold">
            {opponent.persona?.name ?? "—"}
          </span>
          .
        </div>
      </div>

      <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-muted/60">
        Personas affect the explanation; rapid-fire questions are identical
        for both players. {personas.length} personas registered.
      </div>
    </div>
  );
}

/* ================================================================== */
/*                            ARENA HUD                                */
/* ================================================================== */

function ArenaHud({
  you,
  opponent,
  youAccent,
  oppAccent,
  yourCorrect,
  oppCorrect,
  state,
  currentQ,
}: {
  you: Side;
  opponent: Side;
  youAccent: string;
  oppAccent: string;
  yourCorrect: number;
  oppCorrect: number;
  state: BlitzMatchRow["state"];
  currentQ: number;
}) {
  return (
    <div
      className="game-card relative grid grid-cols-1 items-center gap-4 overflow-hidden p-5 sm:grid-cols-[1fr_auto_1fr]"
      style={
        {
          "--shadow":
            state === "FINISHED"
              ? "var(--gold)"
              : state === "BLITZ"
                ? "var(--magenta)"
                : "var(--accent)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface))",
        } as React.CSSProperties
      }
    >
      {/* split-screen seam */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px sm:block"
        style={{
          background:
            "linear-gradient(180deg, transparent, var(--gold), transparent)",
        }}
      />

      <Avatar
        side={you}
        accent={youAccent}
        correct={yourCorrect}
        label="YOU"
        align="left"
      />

      <CenterScore
        you={yourCorrect}
        opp={oppCorrect}
        state={state}
        currentQ={currentQ}
      />

      <Avatar
        side={opponent}
        accent={oppAccent}
        correct={oppCorrect}
        label="OPPONENT"
        align="right"
      />
    </div>
  );
}

function Avatar({
  side,
  accent,
  correct,
  label,
  align,
}: {
  side: Side;
  accent: string;
  correct: number;
  label: string;
  align: "left" | "right";
}) {
  const initials =
    side.profile?.username?.slice(0, 2).toUpperCase() ??
    side.persona?.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("") ??
    "??";
  const isLeft = align === "left";
  return (
    <div
      className={`flex items-center gap-4 ${isLeft ? "" : "flex-row-reverse text-right"}`}
    >
      <motion.div
        animate={{
          scale: correct === TARGET_CORRECT ? [1, 1.2, 1] : 1,
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative"
      >
        <span
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-base font-extrabold text-white"
          style={{
            background: accent,
            border: "3px solid rgba(0,0,0,0.4)",
            boxShadow: `0 5px 0 0 rgba(0,0,0,0.5), 0 0 26px 0 ${accent}88, inset 0 1px 0 rgba(255,255,255,0.5)`,
          }}
        >
          {initials}
        </span>
        {correct === TARGET_CORRECT ? (
          <span
            aria-hidden
            className="pulse-gold absolute inset-0 rounded-2xl"
          />
        ) : null}
      </motion.div>
      <div className={`min-w-0 flex-1 ${isLeft ? "" : "items-end"}`}>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-bold">
          {side.profile?.username ?? side.persona?.name ?? "Anonymous"}
        </p>
        <div className={`mt-2 flex ${isLeft ? "" : "justify-end"}`}>
          <HealthBar
            current={correct}
            max={TARGET_CORRECT}
            color={accent}
            direction={isLeft ? "ltr" : "rtl"}
          />
        </div>
      </div>
    </div>
  );
}

function CenterScore({
  you,
  opp,
  state,
  currentQ,
}: {
  you: number;
  opp: number;
  state: BlitzMatchRow["state"];
  currentQ: number;
}) {
  const phaseLabel =
    state === "STUDY"
      ? "STUDY"
      : state === "BLITZ"
        ? `Q${currentQ + 1}`
        : state === "FINISHED"
          ? "FINAL"
          : "WAIT";
  const phaseColor =
    state === "BLITZ"
      ? "var(--magenta)"
      : state === "FINISHED"
        ? "var(--gold)"
        : "var(--accent-2)";
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="rounded-full border-2 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{
          background: "var(--surface)",
          borderColor: phaseColor,
          color: phaseColor,
        }}
      >
        {phaseLabel}
      </span>
      <div className="mt-1 flex items-baseline gap-3 font-mono text-4xl font-extrabold tabular-nums sm:text-5xl">
        <span style={{ color: "var(--lime)" }}>{you}</span>
        <span className="text-muted/50 text-2xl">:</span>
        <span style={{ color: "var(--magenta)" }}>{opp}</span>
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        first to 3 wins
      </span>
    </div>
  );
}

/* ================================================================== */
/*                            STUDY PANEL                              */
/* ================================================================== */

function StudyPanel({
  accent,
  persona,
  conceptTitle,
  explanation,
  streaming,
  remaining,
  onSkip,
}: {
  accent: string;
  persona: PersonaCardLite | null;
  conceptTitle: string;
  explanation: string;
  streaming: boolean;
  remaining: number;
  onSkip: () => void;
}) {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  return (
    <GameCard skin="cyan" className="mt-6 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{ color: accent }}
          >
            ◐ study phase · {persona?.name ?? "—"}
          </p>
          <h2 className="mt-1 text-3xl font-bold">{conceptTitle}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-xl border-2 bg-surface px-4 py-1.5 font-mono text-xl font-extrabold tabular-nums"
            style={{
              borderColor: accent,
              color: accent,
              boxShadow: `0 4px 0 0 ${accent}`,
            }}
          >
            {m}:{s}
          </span>
          <ArcadeButton
            type="button"
            onClick={onSkip}
            skin="lime"
            size="md"
          >
            ▶ READY — START BLITZ
          </ArcadeButton>
        </div>
      </div>
      <article
        className="mt-6 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border-2 p-5 text-[15px] leading-7 text-foreground/95"
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
        {!streaming && !explanation && (
          <p className="text-sm text-muted">Loading your explanation...</p>
        )}
      </article>
    </GameCard>
  );
}

/* ================================================================== */
/*                            BLITZ PANEL                              */
/* ================================================================== */

function BlitzPanel({
  accent,
  conceptTitle,
  questionIndex,
  question,
  remaining,
  mySubmittedChoice,
  onAnswer,
  totalQuestions,
  shakeKey,
  onShake,
}: {
  accent: string;
  conceptTitle: string;
  questionIndex: number;
  question: SafeQuestion;
  remaining: number;
  mySubmittedChoice: number | undefined;
  onAnswer: (i: number) => void;
  totalQuestions: number;
  shakeKey: number;
  onShake: () => void;
}) {
  const submitted = mySubmittedChoice !== undefined;
  const pct = (remaining / BLITZ_QUESTION_SECONDS) * 100;
  const danger = remaining <= 5;
  const timerColor = danger ? "var(--magenta)" : accent;

  return (
    <div className="relative mt-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={questionIndex}
          initial={{ opacity: 0, y: 60, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
        >
          <motion.div
            key={shakeKey}
            animate={
              shakeKey > 0
                ? { x: [0, -16, 16, -12, 12, -6, 6, 0], rotate: [0, -1.5, 1.5, -1, 1, -0.5, 0.5, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.45 }}
          >
            <GameCard skin="ink" className="p-7">
              <div className="flex items-center justify-between">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.4em]"
                  style={{ color: accent }}
                >
                  {conceptTitle} · Q{questionIndex + 1} / {totalQuestions}
                </p>
                <span
                  className="rounded-xl border-2 bg-surface px-3 py-1 font-mono text-base font-extrabold tabular-nums"
                  style={{
                    borderColor: timerColor,
                    color: timerColor,
                    boxShadow: `0 4px 0 0 ${timerColor}`,
                  }}
                >
                  {remaining}s
                </span>
              </div>

              {/* timer bar */}
              <div
                className="mt-3 h-3 w-full overflow-hidden rounded-full border-2"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "rgba(0,0,0,0.4)",
                }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-200 ease-linear"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${timerColor}, ${accent})`,
                    boxShadow: `0 0 12px 0 ${timerColor}`,
                  }}
                />
              </div>

              <h3 className="mt-6 text-2xl font-bold leading-snug sm:text-3xl">
                {question.q}
              </h3>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {question.choices.map((choice, i) => {
                  const youPicked = mySubmittedChoice === i;
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (submitted) {
                          onShake();
                          return;
                        }
                        onAnswer(i);
                      }}
                      whileHover={
                        submitted ? undefined : { scale: 1.03, y: -2 }
                      }
                      whileTap={submitted ? undefined : { scale: 0.97 }}
                      animate={youPicked ? { scale: 1.04 } : { scale: 1 }}
                      transition={{ type: "spring", stiffness: 360, damping: 22 }}
                      className="group flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-base font-bold transition disabled:cursor-default"
                      style={{
                        background: youPicked
                          ? `color-mix(in srgb, ${accent} 28%, var(--surface))`
                          : "var(--surface)",
                        borderColor: youPicked ? accent : "rgba(0,0,0,0.35)",
                        boxShadow: youPicked
                          ? `0 6px 0 0 ${accent}, 0 0 26px 0 ${accent}55, inset 0 0 0 2px ${accent}`
                          : "0 6px 0 0 var(--border)",
                      }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 font-extrabold"
                        style={{
                          background: youPicked
                            ? accent
                            : "var(--surface-2)",
                          color: youPicked ? "#1a0f00" : "var(--gold)",
                          borderColor: "rgba(0,0,0,0.4)",
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{choice}</span>
                      {youPicked && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.2em]"
                          style={{ color: accent }}
                        >
                          ✓ LOCKED
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {submitted && (
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.3em] text-muted">
                  ▸ locked — waiting for opponent or timer
                </p>
              )}
            </GameCard>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */
/*                           RESULT PANEL                              */
/* ================================================================== */

function ResultPanel({
  accent,
  eloDelta,
  xpDelta,
  eloBefore,
  eloAfter,
  you,
  opponent,
  yourCorrect,
  oppCorrect,
  outcome,
  slangVerdict,
}: {
  accent: string;
  eloDelta: number;
  xpDelta: number;
  eloBefore: number | null;
  eloAfter: number | null;
  you: Side;
  opponent: Side;
  yourCorrect: number;
  oppCorrect: number;
  outcome: "win" | "loss" | "draw" | "tie";
  slangVerdict: string | null;
}) {
  const [shareBusy, setShareBusy] = useState(false);
  const verdict =
    outcome === "win"
      ? "VICTORY"
      : outcome === "loss"
        ? "DEFEAT"
        : "DRAW";
  const verdictIcon =
    outcome === "win" ? "★" : outcome === "loss" ? "✗" : "◇";

  return (
    <div className="relative mt-8">
      {/* floating ELO + XP delta on win */}
      <FloatingDelta
        triggerKey={`elo-${eloDelta}`}
        amount={eloDelta}
        kind={eloDelta >= 0 ? "elo-up" : "elo-down"}
      />
      {xpDelta > 0 && (
        <FloatingDelta
          triggerKey={`xp-${xpDelta}`}
          amount={xpDelta}
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
          skin={
            outcome === "win"
              ? "lime"
              : outcome === "loss"
                ? "magenta"
                : "default"
          }
          pulse={outcome === "win"}
          className="overflow-hidden p-10 text-center"
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ◆ MATCH COMPLETE ◆
          </p>
          <motion.h2
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 14 }}
            className="mt-4 text-7xl font-extrabold tracking-tight sm:text-8xl"
            style={{
              color: accent,
              textShadow: `0 0 40px ${accent}, 0 6px 0 rgba(0,0,0,0.6)`,
            }}
          >
            {verdictIcon} {verdict}
          </motion.h2>
          <p className="mt-4 text-lg text-muted">
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--lime)" }}
            >
              {yourCorrect}
            </span>{" "}
            –{" "}
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--magenta)" }}
            >
              {oppCorrect}
            </span>{" "}
            vs{" "}
            <span className="font-bold">
              {opponent.profile?.username ?? "your opponent"}
            </span>
          </p>
          {slangVerdict && (
            <motion.div
              initial={outcome === "win" ? { opacity: 0, y: 14 } : { opacity: 0, x: -24 }}
              animate={{
                opacity: 1,
                y: 0,
                x: outcome === "win" ? 0 : [0, -6, 6, -3, 3, 0],
              }}
              transition={{ duration: 0.38 }}
              className="mx-auto mt-5 max-w-2xl rounded-xl border-2 px-4 py-3 text-sm font-bold"
              style={{
                background:
                  outcome === "win"
                    ? "color-mix(in srgb, var(--lime) 18%, var(--surface))"
                    : "color-mix(in srgb, var(--magenta) 18%, var(--surface))",
                borderColor: outcome === "win" ? "var(--lime)" : "var(--magenta)",
                color: outcome === "win" ? "var(--lime)" : "var(--magenta)",
              }}
            >
              {slangVerdict}
            </motion.div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ResultStat
              label="Elo"
              value={`${eloDelta > 0 ? "+" : ""}${eloDelta}`}
              accent={eloDelta >= 0 ? "var(--lime)" : "var(--magenta)"}
              sub={eloBefore !== null ? `${eloBefore} → ${eloAfter}` : ""}
            />
            <ResultStat
              label="XP"
              value={xpDelta > 0 ? `+${xpDelta}` : "—"}
              accent="var(--gold)"
              sub={
                outcome === "win"
                  ? "victory bonus"
                  : outcome === "draw"
                    ? "draw consolation"
                    : "no XP this round"
              }
            />
            <ResultStat
              label="Personas"
              value={`${(you.persona?.name ?? "—").split(" ")[0]} vs ${(opponent.persona?.name ?? "—").split(" ")[0]}`}
              accent="var(--accent-2)"
              sub="influence on the explanation only"
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ArcadeButton
              type="button"
              onClick={async () => {
                if (shareBusy) return;
                setShareBusy(true);
                try {
                  const content = `⚔ Blitz ${yourCorrect}-${oppCorrect} · ${outcome.toUpperCase()} · Elo ${eloDelta >= 0 ? "+" : ""}${eloDelta} · ${you.persona?.name ?? "Unknown"}`;
                  await fetch("/api/chat/global", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      kind: "run_share",
                      content,
                      payload: {
                        mode: "blitz",
                        outcome,
                        elo_delta: eloDelta,
                        persona: you.persona?.name ?? null,
                        score: { you: yourCorrect, opp: oppCorrect },
                      },
                    }),
                  });
                } finally {
                  setShareBusy(false);
                }
              }}
              skin="cyan"
              size="lg"
            >
              {shareBusy ? "Sharing..." : "Share to chat"}
            </ArcadeButton>
            <ArcadeLink href="/blitz" skin="lime" size="lg">
              ▶ FIND ANOTHER MATCH
            </ArcadeLink>
            <ArcadeLink href="/dashboard" skin="ghost" size="lg">
              View dashboard
            </ArcadeLink>
            <Link
              href="/colosseum"
              className="text-xs font-bold underline-offset-2 hover:underline"
              style={{ color: "var(--gold)" }}
            >
              today&apos;s drop →
            </Link>
          </div>
        </GameCard>
      </motion.div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub: string;
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
        className="mt-1 text-2xl font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted">{sub}</p>
    </div>
  );
}
