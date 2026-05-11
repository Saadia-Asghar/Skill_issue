"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { ArenaMusicToggle } from "@/components/gladiator/arena-music";
import { useGladiatorMatch } from "@/lib/realtime/client";
import { useSupabase } from "@/lib/supabase/browser";
import type { GladiatorMatchRow } from "@/lib/supabase/types";

type Question = {
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty?: number;
};

export function GladiatorMatchView({
  initialMatch,
  userId,
}: {
  initialMatch: GladiatorMatchRow;
  userId: string;
}) {
  const supabase = useSupabase();
  const subscribed = useGladiatorMatch(supabase, initialMatch.id, initialMatch) ?? initialMatch;
  const [live, setLive] = useState<GladiatorMatchRow>(subscribed);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastWasCorrect, setLastWasCorrect] = useState<boolean | null>(null);
  const [floatingScore, setFloatingScore] = useState<number | null>(null);
  const [cameraShake, setCameraShake] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [swordWinner, setSwordWinner] = useState<"me" | "opp" | null>(null);
  const [players, setPlayers] = useState<{
    p1: { id: string; username: string | null; avatarUrl: string | null };
    p2: { id: string; username: string | null; avatarUrl: string | null };
  } | null>(null);
  const lastAnimatedRound = useRef<number>(0);
  const lastResolvedRound = useRef<number>(0);

  useEffect(() => {
    setLive(subscribed);
  }, [subscribed]);

  const iAmP1 = live.player_one_id === userId;
  const myHealth = iAmP1 ? live.p1_health : live.p2_health;
  const oppHealth = iAmP1 ? live.p2_health : live.p1_health;
  const myScore = iAmP1 ? live.p1_score : live.p2_score;
  const oppScore = iAmP1 ? live.p2_score : live.p1_score;
  const isQuestionPhase = live.phase === "QUESTION";
  const myAnswered = iAmP1 ? Boolean(live.p1_answered_at) : Boolean(live.p2_answered_at);
  const oppAnswered = iAmP1 ? Boolean(live.p2_answered_at) : Boolean(live.p1_answered_at);
  const opponentName =
    (iAmP1 ? live.player_two_id : live.player_one_id) === "BOT_ID"
      ? "Ghost Bot"
      : ((iAmP1 ? players?.p2?.username : players?.p1?.username) ?? "Player 2");
  const myName = iAmP1
    ? (players?.p1?.username ?? "You")
    : (players?.p2?.username ?? "You");
  const myAvatar = iAmP1 ? players?.p1?.avatarUrl ?? null : players?.p2?.avatarUrl ?? null;
  const oppAvatar = iAmP1 ? players?.p2?.avatarUrl ?? null : players?.p1?.avatarUrl ?? null;

  const question = (live.current_question ?? {}) as Question;
  const options = question.options ?? [];
  const roundSummary = (live.last_round_summary ?? {}) as {
    round?: number;
    speed_winner?: string | null;
  };

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const res = await fetch(`/api/gladiator/${initialMatch.id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | {
            match?: GladiatorMatchRow;
            players?: {
              p1: { id: string; username: string | null; avatarUrl: string | null };
              p2: { id: string; username: string | null; avatarUrl: string | null };
            };
          }
        | null;
      if (!alive || !json) return;
      if (json.match) setLive(json.match);
      if (json.players) setPlayers(json.players);
    };
    void pull();
    const pollId = window.setInterval(() => void pull(), 1500);
    return () => {
      alive = false;
      window.clearInterval(pollId);
    };
  }, [initialMatch.id]);

  const roundEndsAtMs =
    new Date(live.round_started_at).getTime() + Math.max(1, live.round_seconds) * 1000;
  const remainingMs = Math.max(0, roundEndsAtMs - tick);
  const remainingSec = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    const r = Number(roundSummary.round ?? 0);
    if (!r || r === lastAnimatedRound.current) return;
    lastAnimatedRound.current = r;
    if (roundSummary.speed_winner === userId) {
      setSwordWinner("me");
      window.setTimeout(() => setSwordWinner(null), 900);
    } else if (roundSummary.speed_winner) {
      setSwordWinner("opp");
      window.setTimeout(() => setSwordWinner(null), 900);
    }
  }, [roundSummary.round, roundSummary.speed_winner, userId]);

  useEffect(() => {
    if (live.status !== "IN_PROGRESS" || live.phase !== "QUESTION") return;
    if (remainingMs > 0) return;
    if (lastResolvedRound.current === live.round_number) return;
    lastResolvedRound.current = live.round_number;
    void fetch(`/api/gladiator/${live.id}/resolve`, { method: "POST" });
  }, [live.id, live.phase, live.round_number, live.status, remainingMs]);

  const submit = useCallback(
    async (choice: number) => {
      if (!isQuestionPhase || myAnswered || isSubmitting || remainingMs <= 0) return;
      setIsSubmitting(true);
      setError(null);
      const res = await fetch(`/api/gladiator/${live.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        isCorrect?: boolean;
        shouldTriggerBot?: boolean;
      };
      if (res.ok) {
        const wasCorrect = json.isCorrect === true;
        setLastWasCorrect(wasCorrect);
        if (wasCorrect) {
          setFloatingScore(50);
          window.setTimeout(() => setFloatingScore(null), 1300);
        } else {
          setCameraShake(true);
          window.setTimeout(() => setCameraShake(false), 320);
        }
        if (json.shouldTriggerBot) {
          void fetch(`/api/gladiator/${live.id}/bot-turn`, { method: "POST" });
        }
      } else {
        setError(json.error ?? "Could not submit answer.");
      }
      setIsSubmitting(false);
    },
    [isQuestionPhase, myAnswered, isSubmitting, remainingMs, live.id],
  );

  const myHealthPct = useMemo(() => `${Math.max(0, myHealth)}%`, [myHealth]);
  const oppHealthPct = useMemo(() => `${Math.max(0, oppHealth)}%`, [oppHealth]);

  if (live.status !== "IN_PROGRESS") {
    const won = live.winner_id === userId;
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="arcade-card p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[var(--gold)]">
            duel finished
          </p>
          <h1 className="mt-3 text-4xl font-black">{won ? "Victory" : "Defeat"}</h1>
          <p className="mt-2 text-muted">
            Final score {myScore} - {oppScore}
          </p>
          <ArcadeLink href="/gladiator" className="mt-6" skin="lime">
            ◀ Back to Agora
          </ArcadeLink>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto w-full max-w-5xl px-6 py-8"
      animate={cameraShake ? { x: [-8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="arcade-card border-[color:var(--coin-gold)] bg-[color:var(--bg-surface)] p-6">
        <div className="relative rounded-xl border-2 border-[color:var(--border-heavy)] bg-[color:var(--surface-2)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--border-heavy)] px-2 py-1 text-xs font-bold">
                Round {live.round_number}
              </span>
              <span className="rounded-full border border-[var(--border-heavy)] px-2 py-1 text-xs font-bold">
                Score {myScore} - {oppScore}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.2em] text-muted">Timer</span>
              <span
                className="rounded-full border px-2 py-1 text-sm font-black"
                style={{
                  borderColor: remainingSec <= 3 ? "var(--mario-red)" : "var(--border-heavy)",
                  color: remainingSec <= 3 ? "var(--mario-red)" : "var(--text-main)",
                }}
              >
                {remainingSec}s
              </span>
              <ArcadeLink href="/gladiator" size="sm" skin="ghost">
                ◀ Back
              </ArcadeLink>
              <ArenaMusicToggle />
            </div>
          </div>

          <div className="flex items-start justify-between gap-5">
            <HealthBar
              label={myName}
              healthPct={myHealthPct}
              value={myHealth}
              align="left"
              flash={myAnswered && !lastWasCorrect && isSubmitting === false}
              avatarUrl={myAvatar}
              fallback={(myName[0] ?? "Y").toUpperCase()}
            />
            <HealthBar
              label={opponentName}
              healthPct={oppHealthPct}
              value={oppHealth}
              align="right"
              flash={false}
              avatarUrl={oppAvatar}
              fallback={
                opponentName === "Ghost Bot"
                  ? "👻"
                  : (opponentName[0] ?? "P").toUpperCase()
              }
            />
          </div>

          <div className="mt-8 rounded-xl border-2 border-[color:var(--border-heavy)] bg-[color:var(--bg-base)] p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Arena Console</p>
            <h2 className="mt-2 text-2xl font-black">{question.prompt}</h2>
            <p className="mt-2 text-xs text-muted">
              {myAnswered
                ? oppAnswered
                  ? "Both locked in. Resolving..."
                  : "Answer locked. Waiting for opponent..."
                : "Tap fast. First correct strike wins the exchange."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {options.map((opt, idx) => (
                <ArcadeButton
                  key={`${idx}-${opt}`}
                  skin="ghost"
                  disabled={!isQuestionPhase || myAnswered || isSubmitting || remainingMs <= 0}
                  onClick={() => void submit(idx)}
                  className="justify-start text-left"
                >
                  {String.fromCharCode(65 + idx)}. {opt}
                </ArcadeButton>
              ))}
            </div>
            {error ? (
              <p className="mt-3 text-sm font-bold text-[var(--mario-red)]">{error}</p>
            ) : null}
          </div>

          {floatingScore ? (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded-full border-2 border-[color:var(--coin-gold)] bg-[color:var(--coin-gold)]/10 px-3 py-1 text-sm font-black text-[var(--coin-gold)]"
              initial={{ y: 12, opacity: 0.2, scale: 0.85 }}
              animate={{ y: -44, opacity: 1, scale: 1.05 }}
              transition={{ duration: 0.7 }}
            >
              +{floatingScore} Points
            </motion.div>
          ) : null}

          {lastWasCorrect ? (
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-xl border-2 border-[color:var(--coin-gold)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0] }}
              transition={{ duration: 0.7 }}
            />
          ) : null}

          {swordWinner ? (
            <motion.div
              className={`pointer-events-none absolute top-12 text-4xl ${
                swordWinner === "me" ? "left-10" : "right-10"
              }`}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: -24, opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              ⚔
            </motion.div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function HealthBar({
  label,
  healthPct,
  value,
  align,
  flash,
  avatarUrl,
  fallback,
}: {
  label: string;
  healthPct: string;
  value: number;
  align: "left" | "right";
  flash: boolean;
  avatarUrl: string | null;
  fallback: string;
}) {
  return (
    <div className={align === "left" ? "w-full" : "w-full text-right"}>
      <div className={`mb-1 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <AvatarBadge avatarUrl={avatarUrl} fallback={fallback} />
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">{label}</p>
      </div>
      <div className="mt-2 h-5 rounded-full border-2 border-[color:var(--border-heavy)] bg-black/40 p-[2px]">
        <motion.div
          className="h-full rounded-full bg-[var(--1up-green)]"
          animate={{
            width: healthPct,
            backgroundColor: flash ? "var(--mario-red)" : "var(--1up-green)",
          }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
      </div>
      <p className="mt-1 text-xs font-bold">{value} HP</p>
    </div>
  );
}

function AvatarBadge({
  avatarUrl,
  fallback,
}: {
  avatarUrl: string | null;
  fallback: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-7 w-7 rounded-full border border-[var(--border-heavy)] object-cover"
      />
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-heavy)] bg-[var(--surface-2)] text-xs font-black">
      {fallback}
    </span>
  );
}
