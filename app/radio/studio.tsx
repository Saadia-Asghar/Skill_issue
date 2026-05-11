"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { ArcadeButton } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import type { RadioEpisodeRow, RadioStatus } from "@/lib/supabase/types";

interface RadioPersona {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
}

interface Segment {
  kind: "intro" | "take" | "dialog" | "outro";
  speaker: string;
  text: string;
}

interface Script {
  title: string;
  segments: Segment[];
}

const STATUS_LABEL: Record<RadioStatus, string> = {
  pending: "Queued",
  scripting: "Writing the script…",
  voicing: "Voicing your hosts…",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_PCT: Record<RadioStatus, number> = {
  pending: 5,
  scripting: 30,
  voicing: 70,
  ready: 100,
  failed: 100,
};

interface RadioStudioProps {
  initialEpisodes: RadioEpisodeRow[];
  personas: RadioPersona[];
  defaultPersonaSlugs: string[];
}

export function RadioStudio({
  initialEpisodes,
  personas,
  defaultPersonaSlugs,
}: RadioStudioProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [activeId, setActiveId] = useState<string | null>(
    initialEpisodes.find((e) => e.status === "ready")?.id ??
      initialEpisodes[0]?.id ??
      null,
  );
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>(defaultPersonaSlugs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = episodes.find((e) => e.id === activeId) ?? null;

  const togglePersona = (slug: string) => {
    setPicked((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= 3
          ? prev
          : [...prev, slug],
    );
  };

  const submit = async () => {
    if (notes.trim().length < 40) {
      setError("Notes must be at least 40 characters.");
      return;
    }
    if (picked.length === 0) {
      setError("Pick at least one persona.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/radio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim(),
          title: title.trim() || undefined,
          personaSlugs: picked,
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 502) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const list = await fetch("/api/radio").then((r) => r.json());
      setEpisodes(list.episodes ?? []);
      setActiveId(json.id);
      if (json.status === "failed") {
        setError(json.error ?? "Generation failed.");
      } else {
        setNotes("");
        setTitle("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    if (active.status === "ready" || active.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/radio/${active.id}`);
        if (!r.ok) return;
        const json = await r.json();
        setEpisodes((prev) =>
          prev.map((e) => (e.id === active.id ? json.episode : e)),
        );
      } catch {
        // swallow — next tick will retry
      }
    }, 2000);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <ComposeCard
        notes={notes}
        setNotes={setNotes}
        title={title}
        setTitle={setTitle}
        personas={personas}
        picked={picked}
        togglePersona={togglePersona}
        onSubmit={submit}
        busy={busy}
        error={error}
      />

      <div className="flex flex-col gap-4">
        {active ? (
          <PlayerCard episode={active} personas={personas} />
        ) : (
          <GameCard skin="cyan" pulse className="p-10 text-center">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.5em]"
              style={{ color: "var(--gold)" }}
            >
              ◉ ON-AIR
            </p>
            <h3 className="mt-3 text-2xl font-bold">
              No episodes yet. Cue up your first broadcast →
            </h3>
          </GameCard>
        )}

        {episodes.length > 1 && (
          <EpisodeList
            episodes={episodes}
            activeId={activeId}
            onSelect={setActiveId}
          />
        )}
      </div>
    </div>
  );
}

interface ComposeCardProps {
  notes: string;
  setNotes: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  personas: RadioPersona[];
  picked: string[];
  togglePersona: (slug: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}

function ComposeCard(props: ComposeCardProps) {
  return (
    <GameCard skin="purple" className="p-6">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        ◉ COMPOSE EPISODE
      </p>
      <h2 className="mt-1 text-xl font-bold">~5 minutes · 3 hosts max</h2>

      <label
        htmlFor="ep-title"
        className="mt-5 block text-[10px] font-bold uppercase tracking-[0.3em] text-muted"
      >
        Title (optional)
      </label>
      <input
        id="ep-title"
        value={props.title}
        onChange={(e) => props.setTitle(e.target.value)}
        placeholder="Why mitochondria are the GOAT"
        className="mt-1 w-full rounded-xl border-2 px-3 py-2 text-sm font-bold focus:outline-none"
        style={{
          background: "var(--surface)",
          borderColor: "rgba(0,0,0,0.35)",
          boxShadow: "0 4px 0 0 var(--border)",
        }}
        maxLength={120}
      />

      <label
        htmlFor="ep-notes"
        className="mt-4 block text-[10px] font-bold uppercase tracking-[0.3em] text-muted"
      >
        Notes
      </label>
      <textarea
        id="ep-notes"
        value={props.notes}
        onChange={(e) => props.setNotes(e.target.value)}
        placeholder="Paste notes, a textbook chapter, or a passage you want to internalize…"
        className="mt-1 h-44 w-full resize-y rounded-xl border-2 px-3 py-2 text-sm leading-relaxed focus:outline-none"
        style={{
          background: "var(--surface)",
          borderColor: "rgba(0,0,0,0.35)",
          boxShadow: "0 4px 0 0 var(--border)",
        }}
        maxLength={12000}
      />
      <div className="mt-1 text-right text-[10px] font-bold text-muted">
        {props.notes.length} / 12000
      </div>

      <p
        className="mt-4 text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ color: "var(--accent-2)" }}
      >
        ◇ Hosts (pick up to 3) · {props.picked.length}/3
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {props.personas.map((p) => {
          const on = props.picked.includes(p.slug);
          return (
            <motion.button
              key={p.slug}
              type="button"
              onClick={() => props.togglePersona(p.slug)}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              animate={on ? { scale: 1.04 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 22 }}
              className="rounded-2xl border-2 px-3 py-3 text-left transition"
              style={{
                background: on
                  ? `color-mix(in srgb, ${p.accentColor} 30%, var(--surface))`
                  : "var(--surface)",
                borderColor: on ? p.accentColor : "rgba(0,0,0,0.3)",
                boxShadow: on
                  ? `0 5px 0 0 ${p.accentColor}, 0 0 18px 2px ${p.accentColor}66`
                  : "0 4px 0 0 var(--border)",
              }}
            >
              <p
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: p.accentColor }}
              >
                {p.name}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted">
                {p.tagline}
              </p>
            </motion.button>
          );
        })}
      </div>

      {props.error && (
        <div
          className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            background:
              "color-mix(in srgb, var(--magenta) 18%, transparent)",
            borderColor: "var(--magenta)",
            color: "var(--magenta)",
          }}
        >
          ! {props.error}
        </div>
      )}

      <ArcadeButton
        type="button"
        onClick={props.onSubmit}
        disabled={props.busy}
        skin="cyan"
        size="lg"
        full
        className="mt-5"
      >
        {props.busy ? "GENERATING... (~60s)" : "▶ GENERATE EPISODE"}
      </ArcadeButton>
    </GameCard>
  );
}

function PlayerCard({
  episode,
  personas,
}: {
  episode: RadioEpisodeRow;
  personas: RadioPersona[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(episode.duration_seconds ?? 0);

  const script: Script | null = useMemo(() => {
    if (!episode.script) return null;
    try {
      return episode.script as unknown as Script;
    } catch {
      return null;
    }
  }, [episode.script]);

  const accentForSlug = (slug: string) =>
    personas.find((p) => p.slug === slug)?.accentColor ?? "var(--accent)";
  const nameForSlug = (slug: string) =>
    personas.find((p) => p.slug === slug)?.name ?? slug;

  const segmentSpans = useMemo(() => {
    if (!script) return [];
    const totalWords = script.segments.reduce(
      (a, s) => a + s.text.trim().split(/\s+/).length,
      0,
    );
    const total = duration || episode.duration_seconds || 0;
    let acc = 0;
    return script.segments.map((s) => {
      const w = s.text.trim().split(/\s+/).length;
      const len = (w / Math.max(1, totalWords)) * total;
      const span = { start: acc, end: acc + len };
      acc += len;
      return span;
    });
  }, [script, duration, episode.duration_seconds]);

  const activeIdx =
    segmentSpans.findIndex((s) => time >= s.start && time < s.end) ?? -1;

  const status = episode.status;
  const isWorking =
    status === "pending" || status === "scripting" || status === "voicing";
  const isReady = status === "ready";

  return (
    <GameCard skin={isReady ? "default" : isWorking ? "cyan" : "magenta"} className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{
              color: isReady
                ? "var(--lime)"
                : status === "failed"
                  ? "var(--magenta)"
                  : "var(--accent-2)",
            }}
          >
            {isReady ? "◉ ON AIR · " : status === "failed" ? "✗ " : "◐ "}
            {STATUS_LABEL[status]}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {script?.title ?? episode.title}
          </h2>
        </div>
        {episode.duration_seconds ? (
          <span
            className="rounded-full border-2 px-3 py-1 text-xs font-bold tabular-nums"
            style={{
              background: "var(--surface)",
              borderColor: "var(--gold)",
              color: "var(--gold)",
            }}
          >
            ~{Math.round(episode.duration_seconds / 60)} min
          </span>
        ) : null}
      </div>

      {isWorking && (
        <div className="mt-4">
          <div
            className="h-3 w-full overflow-hidden rounded-full border-2"
            style={{
              background: "var(--surface-2)",
              borderColor: "rgba(0,0,0,0.4)",
            }}
          >
            <motion.div
              className="h-full"
              initial={{ width: 0 }}
              animate={{ width: `${STATUS_PCT[status]}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{
                background: "var(--accent-2)",
                boxShadow:
                  "0 0 14px 0 var(--accent-2), inset 0 1px 0 rgba(255,255,255,0.45)",
              }}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-muted">
            Hang tight — script + voice can take ~60 seconds.
          </p>
        </div>
      )}

      {status === "failed" && (
        <div
          className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            background:
              "color-mix(in srgb, var(--magenta) 18%, transparent)",
            borderColor: "var(--magenta)",
            color: "var(--magenta)",
          }}
        >
          ! {episode.error_message ?? "Generation failed."}
        </div>
      )}

      {isReady && episode.audio_url && (
        <div
          className="mt-4 rounded-2xl border-2 p-3"
          style={{
            background: "var(--surface)",
            borderColor: "rgba(0,0,0,0.35)",
            boxShadow: "0 5px 0 0 var(--lime)",
          }}
        >
          <audio
            ref={audioRef}
            src={episode.audio_url}
            controls
            className="w-full"
            onLoadedMetadata={(e) =>
              setDuration(Math.round(e.currentTarget.duration))
            }
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          />
        </div>
      )}

      {isReady && !episode.audio_url && episode.error_message && (
        <div
          className="mt-4 rounded-2xl border-2 px-4 py-3 text-sm"
          style={{
            background:
              "color-mix(in srgb, var(--accent-2) 18%, transparent)",
            borderColor: "var(--accent-2)",
            color: "var(--accent-2)",
          }}
        >
          {episode.error_message}
        </div>
      )}

      {script && (
        <div className="mt-5 max-h-[480px] space-y-3 overflow-y-auto pr-1">
          {script.segments.map((seg, i) => {
            const isActive = i === activeIdx;
            const accent = accentForSlug(seg.speaker);
            return (
              <motion.div
                key={i}
                animate={
                  isActive ? { scale: 1.02, x: 4 } : { scale: 1, x: 0 }
                }
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="rounded-2xl border-2 px-4 py-3 transition"
                style={{
                  background: isActive
                    ? `color-mix(in srgb, ${accent} 22%, var(--surface))`
                    : "var(--surface)",
                  borderColor: isActive ? accent : "rgba(0,0,0,0.3)",
                  boxShadow: isActive
                    ? `0 4px 0 0 ${accent}`
                    : "0 3px 0 0 var(--border)",
                }}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.3em]">
                  <span style={{ color: accent }}>
                    {nameForSlug(seg.speaker)}
                  </span>
                  <span className="text-muted">{seg.kind}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {seg.text}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </GameCard>
  );
}

function EpisodeList({
  episodes,
  activeId,
  onSelect,
}: {
  episodes: RadioEpisodeRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <GameCard className="p-4">
      <p
        className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        ◇ library
      </p>
      <div className="mt-1 max-h-72 space-y-2 overflow-y-auto">
        {episodes.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e.id)}
            className="w-full rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition"
            style={{
              background:
                e.id === activeId ? "var(--surface-2)" : "var(--surface)",
              borderColor:
                e.id === activeId ? "var(--lime)" : "rgba(0,0,0,0.3)",
              color: e.id === activeId ? "var(--foreground)" : "var(--muted)",
              boxShadow:
                e.id === activeId
                  ? "0 4px 0 0 var(--lime)"
                  : "0 3px 0 0 var(--border)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">{e.title}</span>
              <span className="ml-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.2em]">
                {STATUS_LABEL[e.status]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </GameCard>
  );
}
