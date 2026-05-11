"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { PersonaCard } from "@/components/game/persona-card";
import {
  useRoomMembersSubscription,
  useRoomSubscription,
  useTick,
} from "@/lib/realtime/client";
import { useSupabase } from "@/lib/supabase/browser";
import type {
  StudyRoomMemberRow,
  StudyRoomRow,
} from "@/lib/supabase/types";

interface PersonaCardLite {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  isCreator: boolean;
}
interface ProfileLite {
  clerk_id: string;
  username: string | null;
  avatar_url: string | null;
}

type SafeQuestion = { q: string; choices: string[] };

interface RoomViewProps {
  initialRoom: StudyRoomRow;
  initialMembers: StudyRoomMemberRow[];
  profiles: ProfileLite[];
  youAreHost: boolean;
  you: string;
  personas: PersonaCardLite[];
}

export function RoomView({
  initialRoom,
  initialMembers,
  profiles,
  youAreHost,
  you,
  personas,
}: RoomViewProps) {
  const supabase = useSupabase();
  const room =
    useRoomSubscription(supabase, initialRoom.id, initialRoom) ?? initialRoom;
  const members = useRoomMembersSubscription(
    supabase,
    initialRoom.id,
    initialMembers,
  );
  const profileFor = useCallback(
    (id: string): ProfileLite | null =>
      profiles.find((p) => p.clerk_id === id) ?? null,
    [profiles],
  );

  const me = members.find((m) => m.user_id === you) ?? null;

  /* --------------- Persona pick + explanation streaming --------------- */
  const [explanation, setExplanation] = useState("");
  const [streamingExplain, setStreamingExplain] = useState(false);
  const explainStartedRef = useRef(false);
  const yourPersona = me?.persona_slug
    ? (personas.find((p) => p.slug === me.persona_slug) ?? null)
    : null;

  useEffect(() => {
    if (room.state !== "STUDY") {
      explainStartedRef.current = false;
      return;
    }
    if (!yourPersona || !room.source_text) return;
    if (explainStartedRef.current) return;
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
            text: room.source_text,
            personaSlug: yourPersona.slug,
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
        setExplanation(
          e instanceof Error ? `Couldn't load explanation: ${e.message}` : "",
        );
      } finally {
        setStreamingExplain(false);
      }
    })();
  }, [room.state, room.source_text, yourPersona]);

  /* -------------------------- Quiz state ------------------------------- */
  const questions = useMemo<SafeQuestion[]>(() => {
    if (room.state !== "QUIZ" || !room.questions) return [];
    const arr = room.questions as unknown as Array<{
      q: string;
      choices: string[];
    }>;
    return arr.map(({ q, choices }) => ({ q, choices }));
  }, [room.state, room.questions]);

  const [verdict, setVerdict] = useState<{
    isCorrect: boolean;
    correct_index: number;
    finished: boolean;
    finish_position: number | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerdict(null);
  }, [me?.current_q]);

  /* -------------------------- Host actions ----------------------------- */
  const [hostBusy, setHostBusy] = useState(false);
  const [sourceDraft, setSourceDraft] = useState(room.source_text ?? "");

  const startStudy = useCallback(async () => {
    setHostBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceText: sourceDraft || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start study");
    } finally {
      setHostBusy(false);
    }
  }, [room.id, sourceDraft]);

  const startQuiz = useCallback(async () => {
    setHostBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/quiz`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start quiz");
    } finally {
      setHostBusy(false);
    }
  }, [room.id]);

  /* -------------------------- Member actions --------------------------- */
  const pickPersona = useCallback(
    async (slug: string) => {
      setError(null);
      const res = await fetch(`/api/rooms/${room.id}/persona`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaSlug: slug }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
      }
    },
    [room.id],
  );

  const submitAnswer = useCallback(
    async (choice: number) => {
      if (!me) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${room.id}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionIndex: me.current_q, choice }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setVerdict(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit");
      } finally {
        setSubmitting(false);
      }
    },
    [room.id, me],
  );

  const advance = useCallback(() => setVerdict(null), []);

  /* ------------------------------ Render ------------------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <Header room={room} youAreHost={youAreHost} />

      {error && (
        <div
          className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {room.state === "LOBBY" && (
            <LobbyPanel
              room={room}
              youAreHost={youAreHost}
              sourceDraft={sourceDraft}
              onSourceChange={setSourceDraft}
              onStart={startStudy}
              hostBusy={hostBusy}
            />
          )}

          {room.state === "STUDY" && (
            <StudyPanel
              room={room}
              me={me}
              personas={personas}
              onPickPersona={pickPersona}
              explanation={explanation}
              streaming={streamingExplain}
              youAreHost={youAreHost}
              onStartQuiz={startQuiz}
              hostBusy={hostBusy}
            />
          )}

          {room.state === "QUIZ" && (
            <QuizPanel
              questions={questions}
              me={me}
              verdict={verdict}
              submitting={submitting}
              onAnswer={submitAnswer}
              onAdvance={advance}
              passThreshold={room.pass_threshold}
            />
          )}

          {room.state === "FINISHED" && (
            <FinishedPanel
              members={members}
              you={you}
              profileFor={profileFor}
            />
          )}
        </div>

        <Sidebar
          members={members}
          profileFor={profileFor}
          personas={personas}
          you={you}
          state={room.state}
          passThreshold={room.pass_threshold}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*                              HEADER                                 */
/* ================================================================== */

function Header({
  room,
  youAreHost,
}: {
  room: StudyRoomRow;
  youAreHost: boolean;
}) {
  const stateColor: Record<StudyRoomRow["state"], string> = {
    LOBBY: "var(--accent-2)",
    STUDY: "var(--accent)",
    QUIZ: "var(--magenta)",
    FINISHED: "var(--gold)",
  };
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--accent-2)" }}
        >
          ◇ STUDY ROOM
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {room.title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="inline-flex items-center gap-1 rounded-2xl border-2 px-3 py-1.5 font-mono text-base font-extrabold tracking-[0.3em]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--gold)",
            color: "var(--gold)",
            boxShadow: "0 4px 0 0 #9a7c00",
          }}
        >
          {room.code}
        </span>
        <span
          className="rounded-full border-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{
            background: "var(--surface)",
            borderColor: stateColor[room.state],
            color: stateColor[room.state],
          }}
        >
          {room.state}
        </span>
        {youAreHost && (
          <span
            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{
              background: "var(--gold)",
              color: "#1a0f00",
              boxShadow: "0 3px 0 0 #9a7c00",
            }}
          >
            ★ HOST
          </span>
        )}
      </div>
    </header>
  );
}

/* ================================================================== */
/*                           LOBBY PANEL                               */
/* ================================================================== */

function LobbyPanel({
  room,
  youAreHost,
  sourceDraft,
  onSourceChange,
  onStart,
  hostBusy,
}: {
  room: StudyRoomRow;
  youAreHost: boolean;
  sourceDraft: string;
  onSourceChange: (s: string) => void;
  onStart: () => void;
  hostBusy: boolean;
}) {
  return (
    <GameCard className="p-6">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        ◐ lobby
      </p>
      <h2 className="mt-1 text-2xl font-bold">
        Share the code, paste the source.
      </h2>
      <p className="mt-2 text-sm text-muted">
        Anyone with the code can join. The host pastes a slide or lecture
        excerpt below; once everyone&apos;s here, the host clicks Start Study.
      </p>

      <div className="mt-5">
        {youAreHost ? (
          <textarea
            value={sourceDraft}
            onChange={(e) => onSourceChange(e.target.value.slice(0, 12_000))}
            rows={8}
            placeholder="Paste lecture or slide content..."
            className="w-full rounded-xl border-2 px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none"
            style={{
              background: "var(--surface)",
              borderColor: "rgba(0,0,0,0.35)",
              boxShadow: "0 5px 0 0 var(--border)",
            }}
          />
        ) : (
          <div
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold text-muted"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            {room.source_text
              ? `Host has loaded ${Math.ceil(room.source_text.length / 100) * 100} chars of source.`
              : "Waiting for the host to paste source material..."}
          </div>
        )}
      </div>

      {youAreHost && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <ArcadeButton
            type="button"
            disabled={hostBusy || sourceDraft.trim().length < 30}
            onClick={onStart}
            skin="lime"
            size="md"
          >
            {hostBusy ? "GENERATING..." : "▶ START STUDY"}
          </ArcadeButton>
        </div>
      )}
    </GameCard>
  );
}

/* ================================================================== */
/*                           STUDY PANEL                               */
/* ================================================================== */

function StudyPanel({
  room,
  me,
  personas,
  onPickPersona,
  explanation,
  streaming,
  youAreHost,
  onStartQuiz,
  hostBusy,
}: {
  room: StudyRoomRow;
  me: StudyRoomMemberRow | null;
  personas: PersonaCardLite[];
  onPickPersona: (slug: string) => void;
  explanation: string;
  streaming: boolean;
  youAreHost: boolean;
  onStartQuiz: () => void;
  hostBusy: boolean;
}) {
  const myPersona = me?.persona_slug
    ? (personas.find((p) => p.slug === me.persona_slug) ?? null)
    : null;

  const tick = useTick(500, !!room.study_started_at);
  const remaining = useMemo(() => {
    if (!room.study_started_at) return room.study_seconds;
    const startMs = new Date(room.study_started_at).getTime();
    const elapsed = Math.floor((tick - startMs) / 1000);
    return Math.max(0, room.study_seconds - elapsed);
  }, [room.study_started_at, room.study_seconds, tick]);
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");

  const heroes = personas.filter((p) => p.isCreator);
  const others = personas.filter((p) => !p.isCreator);

  return (
    <div className="flex flex-col gap-4">
      {!myPersona ? (
        <GameCard skin="purple" className="p-6">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{ color: "var(--gold)" }}
          >
            ◐ step 1 · character select
          </p>
          <h2 className="mt-1 text-2xl font-bold">Pick your professor</h2>
          <p className="mt-2 text-sm text-muted">
            Each member studies through their own persona. Quiz questions are
            the same for everyone.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {heroes.map((p) => (
              <PersonaCard
                key={p.slug}
                persona={p}
                selected={false}
                onSelect={onPickPersona}
              />
            ))}
          </div>
          {others.length > 0 && (
            <details className="mt-5 group">
              <summary
                className="cursor-pointer text-xs font-bold uppercase tracking-[0.3em]"
                style={{ color: "var(--accent-2)" }}
              >
                + more archetypes
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {others.map((p) => (
                  <PersonaCard
                    key={p.slug}
                    persona={p}
                    selected={false}
                    onSelect={onPickPersona}
                  />
                ))}
              </div>
            </details>
          )}
        </GameCard>
      ) : (
        <GameCard skin="cyan" className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.4em]"
                style={{ color: myPersona.accentColor }}
              >
                ◉ studying with {myPersona.name}
              </p>
              <p className="mt-1 text-xs text-muted">
                Re-pick a persona below to restart your explanation.
              </p>
            </div>
            <span
              className="rounded-xl border-2 bg-surface px-4 py-1.5 font-mono text-xl font-extrabold tabular-nums"
              style={{
                borderColor: myPersona.accentColor,
                color: myPersona.accentColor,
                boxShadow: `0 4px 0 0 ${myPersona.accentColor}`,
              }}
            >
              {m}:{s}
            </span>
          </div>
          <article
            className="mt-5 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border-2 p-5 text-[15px] leading-7 text-foreground/95"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            {explanation || (streaming ? "" : "Loading...")}
            {streaming && (
              <span
                className="ml-1 inline-block h-4 w-2 -translate-y-0.5 animate-pulse"
                style={{ background: myPersona.accentColor }}
              />
            )}
          </article>
        </GameCard>
      )}

      {youAreHost && (
        <GameCard className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted">
            When the room is ready, hit Start Quiz — everyone races through 5
            questions.
          </p>
          <ArcadeButton
            type="button"
            disabled={hostBusy}
            onClick={onStartQuiz}
            skin="magenta"
            size="md"
          >
            {hostBusy ? "..." : "⚔ START QUIZ"}
          </ArcadeButton>
        </GameCard>
      )}
    </div>
  );
}

/* ================================================================== */
/*                            QUIZ PANEL                               */
/* ================================================================== */

function QuizPanel({
  questions,
  me,
  verdict,
  submitting,
  onAnswer,
  onAdvance,
  passThreshold,
}: {
  questions: SafeQuestion[];
  me: StudyRoomMemberRow | null;
  verdict: {
    isCorrect: boolean;
    correct_index: number;
    finished: boolean;
    finish_position: number | null;
  } | null;
  submitting: boolean;
  onAnswer: (i: number) => void;
  onAdvance: () => void;
  passThreshold: number;
}) {
  if (!me) return null;
  if (me.finished_at) {
    return (
      <GameCard skin="lime" pulse className="p-10 text-center">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--gold)" }}
        >
          ✓ you finished
        </p>
        <h2
          className="mt-3 text-5xl font-extrabold tracking-tight"
          style={{ color: "var(--lime)", textShadow: "0 0 30px var(--lime)" }}
        >
          {placeLabel(me.finish_position).toUpperCase()}
        </h2>
        <p className="mt-3 text-base text-muted">
          {me.correct_count} correct. Waiting for the rest of the room.
        </p>
      </GameCard>
    );
  }

  const q = questions[me.current_q];
  if (!q) {
    return (
      <GameCard className="p-10 text-center">
        <p className="text-sm text-muted">Loading question...</p>
      </GameCard>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={me.current_q}
        initial={{ opacity: 0, y: 40, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        <GameCard skin="ink" className="p-6">
          <div className="flex items-center justify-between">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.4em]"
              style={{ color: "var(--magenta)" }}
            >
              ⚔ Q{me.current_q + 1} of {questions.length}
            </p>
            <p className="font-mono text-xs font-bold tabular-nums">
              <span style={{ color: "var(--lime)" }}>{me.correct_count}</span>{" "}
              <span className="text-muted">/</span> {passThreshold}
            </p>
          </div>
          <h3 className="mt-4 text-2xl font-bold leading-snug sm:text-3xl">
            {q.q}
          </h3>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {q.choices.map((choice, i) => {
              const isCorrect = verdict && i === verdict.correct_index;
              const isWrong =
                verdict && verdict.isCorrect === false && i === verdict.correct_index;
              const cardColor = isCorrect
                ? "var(--lime)"
                : isWrong
                  ? "var(--magenta)"
                  : "var(--border)";
              return (
                <motion.button
                  key={i}
                  type="button"
                  onClick={() => onAnswer(i)}
                  disabled={!!verdict || submitting}
                  whileHover={
                    verdict || submitting ? undefined : { scale: 1.03, y: -2 }
                  }
                  whileTap={
                    verdict || submitting ? undefined : { scale: 0.97 }
                  }
                  className="group flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-base font-bold transition disabled:cursor-default"
                  style={{
                    background: isCorrect
                      ? "color-mix(in srgb, var(--lime) 28%, var(--surface))"
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
                </motion.button>
              );
            })}
          </div>
          {verdict && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold">
                {verdict.isCorrect ? (
                  <span style={{ color: "var(--lime)" }}>✓ Correct.</span>
                ) : (
                  <span style={{ color: "var(--magenta)" }}>✗ Not quite.</span>
                )}{" "}
                <span className="text-muted">
                  {me.correct_count} / {passThreshold} so far
                </span>
              </p>
              <ArcadeButton
                type="button"
                onClick={onAdvance}
                skin="cyan"
                size="md"
              >
                ▶ NEXT
              </ArcadeButton>
            </div>
          )}
        </GameCard>
      </motion.div>
    </AnimatePresence>
  );
}

/* ================================================================== */
/*                          FINISHED PANEL                             */
/* ================================================================== */

function FinishedPanel({
  members,
  you,
  profileFor,
}: {
  members: StudyRoomMemberRow[];
  you: string;
  profileFor: (id: string) => ProfileLite | null;
}) {
  const sorted = [...members].sort((a, b) => {
    if (a.finish_position && b.finish_position) {
      return a.finish_position - b.finish_position;
    }
    if (a.finish_position) return -1;
    if (b.finish_position) return 1;
    return b.correct_count - a.correct_count;
  });
  return (
    <GameCard skin="gold" className="p-6">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        ★ final standings ★
      </p>
      <div className="mt-5 flex flex-col gap-2">
        {sorted.map((m, i) => {
          const profile = profileFor(m.user_id);
          const isYou = m.user_id === you;
          const place = m.finish_position ?? i + 1;
          const podium = place <= 3 && m.finish_position;
          const podiumColor =
            place === 1
              ? "var(--gold)"
              : place === 2
                ? "var(--silver)"
                : place === 3
                  ? "var(--bronze)"
                  : "var(--border)";
          return (
            <div
              key={m.user_id}
              className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3"
              style={{
                background: isYou
                  ? "color-mix(in srgb, var(--lime) 18%, var(--surface))"
                  : "var(--surface)",
                borderColor: "rgba(0,0,0,0.35)",
                boxShadow: `0 4px 0 0 ${isYou ? "var(--lime)" : podium ? podiumColor : "var(--border)"}`,
              }}
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 font-extrabold"
                style={{
                  background: podium ? podiumColor : "var(--surface-2)",
                  color: podium ? "#1a0f00" : "var(--muted)",
                  borderColor: "rgba(0,0,0,0.4)",
                  boxShadow: podium ? "0 3px 0 0 rgba(0,0,0,0.4)" : undefined,
                }}
              >
                {place === 1 ? "★" : place === 2 ? "◆" : place === 3 ? "▲" : `#${place}`}
              </span>
              <span className="flex-1 truncate text-sm font-bold">
                {profile?.username ?? m.user_id.slice(-6)}
                {isYou && (
                  <span
                    className="ml-2 rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-widest"
                    style={{ background: "var(--lime)", color: "#0a1f00" }}
                  >
                    you
                  </span>
                )}
              </span>
              <span className="text-xs font-bold text-muted">
                {m.correct_count} correct · {m.persona_slug ?? "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <ArcadeLink href="/rooms" skin="ghost" size="md">
          New room
        </ArcadeLink>
        <ArcadeLink href="/dashboard" skin="lime" size="md">
          ▶ Dashboard
        </ArcadeLink>
      </div>
    </GameCard>
  );
}

/* ================================================================== */
/*                              SIDEBAR                                */
/* ================================================================== */

function Sidebar({
  members,
  profileFor,
  personas,
  you,
  state,
  passThreshold,
}: {
  members: StudyRoomMemberRow[];
  profileFor: (id: string) => ProfileLite | null;
  personas: PersonaCardLite[];
  you: string;
  state: StudyRoomRow["state"];
  passThreshold: number;
}) {
  return (
    <GameCard skin="ink" className="flex flex-col gap-3 p-5">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        ◉ players ({members.length})
      </p>
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {members.map((m) => {
            const profile = profileFor(m.user_id);
            const persona = m.persona_slug
              ? (personas.find((p) => p.slug === m.persona_slug) ?? null)
              : null;
            const accent = persona?.accentColor ?? "var(--border)";
            const isYou = m.user_id === you;
            return (
              <motion.div
                key={m.user_id}
                layout
                initial={{ opacity: 0, x: 20, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 360, damping: 22 }}
                className="flex items-center gap-3 rounded-2xl border-2 px-3 py-2"
                style={{
                  background: isYou
                    ? "color-mix(in srgb, var(--lime) 14%, var(--surface))"
                    : "var(--surface)",
                  borderColor: "rgba(0,0,0,0.35)",
                  boxShadow: `0 4px 0 0 ${isYou ? "var(--lime)" : accent}`,
                }}
              >
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-extrabold text-white"
                  style={{
                    background: accent,
                    border: "2px solid rgba(0,0,0,0.4)",
                    boxShadow:
                      "0 3px 0 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45)",
                  }}
                >
                  {(profile?.username ?? "??").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {profile?.username ?? m.user_id.slice(-6)}
                    {isYou && (
                      <span
                        className="ml-1 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-widest"
                        style={{ background: "var(--lime)", color: "#0a1f00" }}
                      >
                        you
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {persona?.name ?? "picking..."}
                  </p>
                </div>
                {state === "QUIZ" && (
                  <span
                    className="rounded-md border-2 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums"
                    style={{
                      background: "var(--surface-2)",
                      borderColor: accent,
                      color: accent,
                    }}
                  >
                    {m.correct_count}/{passThreshold}
                  </span>
                )}
                {m.finish_position && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.3em]"
                    style={{ color: "var(--gold)" }}
                  >
                    #{m.finish_position}
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </GameCard>
  );
}

function placeLabel(position: number | null): string {
  if (position === 1) return "1st place";
  if (position === 2) return "2nd place";
  if (position === 3) return "3rd place";
  if (position) return `#${position}`;
  return "Done.";
}
