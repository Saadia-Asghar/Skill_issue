"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ArcadeButton } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";

const SLOTS = 6;

export function RoomsLobby() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const create = async () => {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          sourceText: sourceText || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.hint
          ? `${json.error ?? `HTTP ${res.status}`}\n\n→ ${json.hint}`
          : (json.error ?? `HTTP ${res.status}`);
        throw new Error(msg);
      }
      router.push(`/rooms/${json.room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    setBusy("join");
    setError(null);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.hint
          ? `${json.error ?? `HTTP ${res.status}`}\n\n→ ${json.hint}`
          : (json.error ?? `HTTP ${res.status}`);
        throw new Error(msg);
      }
      router.push(`/rooms/${json.room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join room");
    } finally {
      setBusy(null);
    }
  };

  // chunked code display: render 6 individual slots from the typed string
  const slots = Array.from({ length: SLOTS }).map((_, i) => code[i] ?? "");

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      {/* JOIN — chunky 6-slot arcade input */}
      <GameCard skin="cyan" className="p-6">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--accent-2)" }}
        >
          ◇ join with a code
        </p>
        <h2 className="mt-2 text-xl font-bold">Got 6 from your buddy?</h2>
        <p className="mt-1 text-sm text-muted">
          Drop them in. The portal opens instantly.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="relative">
            {/* Hidden field captures the actual input */}
            <input
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, SLOTS),
                )
              }
              maxLength={SLOTS}
              inputMode="text"
              autoCapitalize="characters"
              aria-label="Room code"
              className="absolute inset-0 z-10 w-full rounded-2xl bg-transparent text-center text-transparent caret-transparent focus:outline-none"
            />
            {/* Visible slots */}
            <div className="grid grid-cols-6 gap-2 sm:gap-3">
              {slots.map((ch, i) => {
                const filled = !!ch;
                const isCursor = i === code.length;
                return (
                  <motion.div
                    key={i}
                    animate={
                      filled ? { scale: [1.15, 1] } : { scale: 1 }
                    }
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="flex aspect-square items-center justify-center rounded-2xl border-2 font-mono text-3xl font-extrabold tabular-nums sm:text-4xl"
                    style={{
                      background: filled
                        ? "color-mix(in srgb, var(--accent-2) 28%, var(--surface))"
                        : "var(--surface)",
                      borderColor: filled
                        ? "var(--accent-2)"
                        : isCursor
                          ? "var(--lime)"
                          : "rgba(0,0,0,0.35)",
                      color: filled ? "var(--accent-2)" : "var(--muted)",
                      boxShadow: filled
                        ? "0 5px 0 0 var(--accent-2)"
                        : "0 5px 0 0 var(--border)",
                    }}
                  >
                    {ch || (isCursor ? "▎" : "·")}
                  </motion.div>
                );
              })}
            </div>
          </div>
          <ArcadeButton
            type="button"
            disabled={code.length !== SLOTS || busy !== null}
            onClick={join}
            skin="cyan"
            size="lg"
            full
          >
            {busy === "join" ? "JOINING..." : "▶ JOIN ROOM"}
          </ArcadeButton>
        </div>
      </GameCard>

      {/* HOST — chunky create card */}
      <GameCard skin="purple" className="p-6">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--accent)" }}
        >
          ◆ host a new room
        </p>
        <h2 className="mt-2 text-xl font-bold">Spin up the cabinet</h2>
        <p className="mt-1 text-sm text-muted">
          Paste a slide or lecture excerpt now (or later). The AI generates 5
          quiz questions everyone races through.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Bio 101: Mitochondrial respiration"
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold text-foreground placeholder:font-medium placeholder:text-muted/60 focus:outline-none"
            style={{
              background: "var(--surface)",
              borderColor: "rgba(0,0,0,0.3)",
              boxShadow: "0 4px 0 0 var(--border)",
            }}
          />
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value.slice(0, 12_000))}
            placeholder="Paste slide text, lecture transcript, or a textbook excerpt..."
            rows={6}
            className="rounded-xl border-2 px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none"
            style={{
              background: "var(--surface)",
              borderColor: "rgba(0,0,0,0.3)",
              boxShadow: "0 4px 0 0 var(--border)",
            }}
          />
          <ArcadeButton
            type="button"
            disabled={busy !== null}
            onClick={create}
            skin="lime"
            size="lg"
            full
          >
            {busy === "create" ? "CREATING..." : "▶ CREATE ROOM"}
          </ArcadeButton>
        </div>
      </GameCard>

      {error && (
        <div
          className="lg:col-span-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold"
          style={{
            background: "color-mix(in srgb, var(--magenta) 18%, transparent)",
            borderColor: "var(--magenta)",
            color: "var(--magenta)",
          }}
        >
          ! {error}
        </div>
      )}
    </div>
  );
}
