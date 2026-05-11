"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArcadeButton } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import {
  PersonaCard,
  type PersonaCardData,
} from "@/components/game/persona-card";
import { primeSlangSpeech, speakSlangVerdict } from "@/lib/speech/slang-tts";

type Phase = "input" | "explaining" | "ready" | "gauntlet" | "done";

interface ServerQuestion {
  id: number;
  q: string;
  choices: string[];
}

interface AnswerResult {
  correct: boolean;
  slang_verdict: string;
  correct_index: number;
  correct_choice: string;
  your_choice: string | null;
  gotcha: string;
}

const SAMPLE_CONCEPT = `Quantum entanglement is a phenomenon in which two particles remain correlated such that the quantum state of one instantly determines the state of the other, no matter how far apart they are. Measuring one particle's spin appears to "collapse" the other's spin into a complementary state faster than light could travel between them — yet no usable information is transmitted, because the outcome of each individual measurement is random. Einstein famously called this "spooky action at a distance," but Bell's theorem and decades of experiments have confirmed entanglement is a real, non-classical correlation built into the structure of quantum mechanics.`;

interface LearnFlowProps {
  personas: PersonaCardData[];
  creatorSlugs: string[];
}

export function LearnFlow({ personas, creatorSlugs }: LearnFlowProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [personaSlug, setPersonaSlug] = useState<string>(creatorSlugs[0] ?? "");
  const [explanation, setExplanation] = useState("");
  const [streamingExplanation, setStreamingExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [generatingGauntlet, setGeneratingGauntlet] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const persona = useMemo(
    () => personas.find((p) => p.slug === personaSlug) ?? null,
    [personas, personaSlug],
  );

  const reset = useCallback(() => {
    setPhase("input");
    setExplanation("");
    setError(null);
    setSessionId(null);
    setQuestions([]);
    setActiveQ(0);
    setResults({});
    setReExplanations({});
    setStreamingReExplain(null);
  }, []);

  const onFile = useCallback(async (file: File) => {
    if (file.size > 200_000) {
      setError("File too large — keep it under 200KB of plain text.");
      return;
    }
    const txt = await file.text();
    setText(txt);
    setError(null);
  }, []);

  const generateExplanation = useCallback(async () => {
    if (!text.trim() || !personaSlug) return;
    setError(null);
    setExplanation("");
    setPhase("explaining");
    setStreamingExplanation(true);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, personaSlug }),
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
      setError(e instanceof Error ? e.message : "Failed to generate explanation");
      setPhase("input");
    } finally {
      setStreamingExplanation(false);
    }
  }, [text, personaSlug]);

  const enterGauntlet = useCallback(async () => {
    if (!explanation.trim() || !personaSlug) return;
    setError(null);
    setGeneratingGauntlet(true);

    try {
      const res = await fetch("/api/gauntlet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, explanation, personaSlug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setSessionId(json.sessionId);
      setQuestions(json.questions);
      setActiveQ(0);
      setResults({});
      setReExplanations({});
      setPhase("gauntlet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the gauntlet");
    } finally {
      setGeneratingGauntlet(false);
    }
  }, [text, explanation, personaSlug]);

  const submitAnswer = useCallback(
    async (choice: number) => {
      if (!sessionId || results[activeQ]) return;
      primeSlangSpeech();

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

  const nextQuestion = useCallback(() => {
    if (activeQ + 1 >= questions.length) {
      setPhase("done");
    } else {
      setActiveQ(activeQ + 1);
    }
  }, [activeQ, questions.length]);

  const correctCount = Object.values(results).filter((r) => r.correct).length;
  const accent = persona?.accentColor ?? "var(--lime)";
  const activeResult = results[activeQ] ?? null;

  useEffect(() => {
    if (!activeResult?.slang_verdict) return;
    speakSlangVerdict({
      verdict: activeResult.slang_verdict,
      isCorrect: activeResult.correct,
      personaSlug: personaSlug,
    });
  }, [activeResult?.slang_verdict, activeResult?.correct, personaSlug]);

  return (
    <div className="flex flex-col gap-6">
      <Stepper phase={phase} />

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

      {phase === "input" && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <GameCard className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="concept-text"
                className="text-sm font-bold"
              >
                Paste a concept, passage, or upload a text file
              </label>
              <div className="flex gap-2">
                <ArcadeButton
                  type="button"
                  size="sm"
                  skin="ghost"
                  onClick={() => setText(SAMPLE_CONCEPT)}
                >
                  Use sample
                </ArcadeButton>
                <ArcadeButton
                  type="button"
                  size="sm"
                  skin="ghost"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload .txt
                </ArcadeButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <textarea
              id="concept-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Explain how the BGP routing protocol prevents persistent routing loops, with reference to the AS_PATH attribute..."
              className="min-h-[220px] resize-y rounded-xl border-2 px-4 py-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted/60 focus:outline-none"
              style={{
                background: "var(--surface)",
                borderColor: "rgba(0,0,0,0.35)",
                boxShadow: "0 5px 0 0 var(--border)",
              }}
            />
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-bold">
                {text.length.toLocaleString()} chars (max 12,000)
              </span>
              <span>Markdown ok. Code blocks ok.</span>
            </div>
          </GameCard>

          <GameCard skin="purple" className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Pick your professor</p>
              <span
                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: "var(--gold)" }}
              >
                creator modes
              </span>
            </div>
            <PersonaPicker
              personas={personas}
              selected={personaSlug}
              onSelect={setPersonaSlug}
            />
            <ArcadeButton
              type="button"
              disabled={!text.trim() || !personaSlug}
              onClick={generateExplanation}
              skin="lime"
              size="lg"
              full
              className="mt-3"
            >
              ▶ GENERATE EXPLANATION
            </ArcadeButton>
          </GameCard>
        </div>
      )}

      {(phase === "explaining" || phase === "ready") && (
        <ExplanationCard
          persona={persona}
          accent={accent}
          explanation={explanation}
          streaming={streamingExplanation}
          onEnterGauntlet={enterGauntlet}
          onReset={reset}
          generatingGauntlet={generatingGauntlet}
          ready={phase === "ready"}
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
          onNext={nextQuestion}
          correctSoFar={correctCount}
          shakeKey={shakeKey}
        />
      )}

      {phase === "done" && (
        <ResultCard
          persona={persona}
          accent={accent}
          correctCount={correctCount}
          total={questions.length}
          onAgain={reset}
          onRetake={() => {
            setActiveQ(0);
            setResults({});
            setReExplanations({});
            setPhase("gauntlet");
          }}
        />
      )}
    </div>
  );
}

function Stepper({ phase }: { phase: Phase }) {
  const steps: { key: Phase | "explaining"; label: string; icon: string }[] = [
    { key: "input", label: "PICK", icon: "1" },
    { key: "explaining", label: "LISTEN", icon: "2" },
    { key: "gauntlet", label: "GAUNTLET", icon: "3" },
    { key: "done", label: "VERDICT", icon: "4" },
  ];
  const order = ["input", "explaining", "ready", "gauntlet", "done"];
  const idx = order.indexOf(phase);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((s) => {
        const sIdx = order.indexOf(s.key);
        const reached = idx >= sIdx;
        const active =
          (s.key === "explaining" &&
            (phase === "explaining" || phase === "ready")) ||
          s.key === phase;
        const color = active
          ? "var(--lime)"
          : reached
            ? "var(--accent-2)"
            : "var(--border)";
        return (
          <li
            key={s.key}
            className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{
              background: active
                ? "color-mix(in srgb, var(--lime) 18%, var(--surface))"
                : "var(--surface)",
              borderColor: color,
              color: active ? "var(--lime)" : reached ? "var(--foreground)" : "var(--muted)",
              boxShadow: active ? `0 4px 0 0 ${color}` : undefined,
            }}
          >
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold"
              style={{
                background: active
                  ? "var(--lime)"
                  : reached
                    ? "var(--accent-2)"
                    : "var(--surface-2)",
                color: active || reached ? "#0a1f00" : "var(--muted)",
              }}
            >
              {s.icon}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function PersonaPicker({
  personas,
  selected,
  onSelect,
}: {
  personas: PersonaCardData[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  const creators = personas.filter((p) => p.isCreator);
  const others = personas.filter((p) => !p.isCreator);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {creators.map((p) => (
          <PersonaCard
            key={p.slug}
            persona={p}
            selected={selected === p.slug}
            onSelect={onSelect}
            variant="compact"
          />
        ))}
      </div>
      {others.length > 0 && (
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
                selected={selected === p.slug}
                onSelect={onSelect}
                variant="compact"
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ExplanationCard({
  persona,
  accent,
  explanation,
  streaming,
  onEnterGauntlet,
  onReset,
  generatingGauntlet,
  ready,
}: {
  persona: PersonaCardData | null;
  accent: string;
  explanation: string;
  streaming: boolean;
  onEnterGauntlet: () => void;
  onReset: () => void;
  generatingGauntlet: boolean;
  ready: boolean;
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
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-bold uppercase tracking-[0.2em] text-muted transition hover:text-foreground"
        >
          ← start over
        </button>
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ArcadeButton
          type="button"
          disabled={!ready || generatingGauntlet}
          onClick={onEnterGauntlet}
          skin="lime"
          size="lg"
        >
          {generatingGauntlet
            ? "BUILDING THE GAUNTLET..."
            : "⚔ ENTER THE COMPREHENSION GAUNTLET"}
        </ArcadeButton>
        {!ready && (
          <span className="text-xs text-muted">
            Streaming the explanation in {persona?.name}&apos;s voice...
          </span>
        )}
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
  onNext,
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
  onSubmit: (choice: number) => void;
  onReExplain: () => void;
  onNext: () => void;
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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs">
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
                Score:{" "}
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
                  borderColor: result.correct ? "var(--lime)" : "var(--magenta)",
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
                {result.slang_verdict && (
                  <motion.div
                    initial={
                      result.correct
                        ? { opacity: 0, scale: 0.82, y: 12 }
                        : { opacity: 0, x: -28 }
                    }
                    animate={
                      result.correct
                        ? { opacity: 1, scale: 1, y: 0 }
                        : { opacity: 1, x: [0, -8, 8, -4, 4, 0] }
                    }
                    transition={
                      result.correct
                        ? { type: "spring", stiffness: 340, damping: 20 }
                        : { duration: 0.36 }
                    }
                    className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
                    style={{
                      background: result.correct
                        ? "color-mix(in srgb, var(--lime) 20%, var(--surface-2))"
                        : "color-mix(in srgb, var(--magenta) 20%, var(--surface-2))",
                      borderColor: result.correct ? "var(--lime)" : "var(--magenta)",
                      color: result.correct ? "var(--lime)" : "var(--magenta)",
                      boxShadow: `0 4px 0 0 ${result.correct ? "var(--lime)" : "var(--magenta)"}`,
                    }}
                  >
                    {result.slang_verdict}
                  </motion.div>
                )}

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
                        ◐ Get a sharper re-explanation in {persona.name}&apos;s
                        voice
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
                  onClick={onNext}
                  skin={result.correct ? "lime" : "cyan"}
                  size="md"
                  className="self-end"
                >
                  {activeQ + 1 >= total ? "▶ SEE VERDICT" : "▶ NEXT QUESTION"}
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
  persona,
  accent,
  correctCount,
  total,
  onAgain,
  onRetake,
}: {
  persona: PersonaCardData | null;
  accent: string;
  correctCount: number;
  total: number;
  onAgain: () => void;
  onRetake: () => void;
}) {
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const verdict =
    pct === 100
      ? "SHARP."
      : pct >= 67
        ? "SOLID."
        : pct >= 34
          ? "STICKY IN PLACES."
          : "RE-RACK & RUN AGAIN.";
  const verdictColor =
    pct === 100
      ? "var(--lime)"
      : pct >= 67
        ? "var(--gold)"
        : pct >= 34
          ? "var(--tangerine)"
          : "var(--magenta)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      <GameCard
        skin={pct === 100 ? "lime" : pct < 34 ? "magenta" : "default"}
        pulse={pct === 100}
        className="p-10 text-center"
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[0.5em]"
          style={{ color: "var(--gold)" }}
        >
          ◆ {persona?.name} · VERDICT ◆
        </p>
        <motion.p
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 14 }}
          className="mt-4 text-7xl font-extrabold tabular-nums tracking-tight sm:text-8xl"
          style={{ color: accent, textShadow: `0 0 40px ${accent}` }}
        >
          {correctCount}
          <span
            className="text-4xl text-muted sm:text-5xl"
            style={{ textShadow: "none" }}
          >
            /{total}
          </span>
        </motion.p>
        <p
          className="mt-3 text-2xl font-extrabold tracking-[0.2em]"
          style={{ color: verdictColor }}
        >
          {verdict}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ArcadeButton
            type="button"
            onClick={onRetake}
            skin="ghost"
            size="md"
          >
            Re-take same gauntlet
          </ArcadeButton>
          <ArcadeButton
            type="button"
            onClick={onAgain}
            skin="lime"
            size="lg"
          >
            ▶ TRY A NEW CONCEPT
          </ArcadeButton>
        </div>
      </GameCard>
    </motion.div>
  );
}
