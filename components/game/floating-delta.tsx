"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export type DeltaKind = "xp" | "elo-up" | "elo-down" | "streak" | "neutral";

interface FloatingDeltaProps {
  /**
   * Each unique key triggers one fresh animation. Pass in a stable id like
   * `q-${currentQ}-${didIWin}` so re-renders don't re-fire it.
   */
  triggerKey: string | number | null;
  amount: number;
  kind: DeltaKind;
  label?: string;
  className?: string;
}

const KIND_COLOR: Record<DeltaKind, string> = {
  xp: "var(--gold)",
  "elo-up": "var(--lime)",
  "elo-down": "var(--magenta)",
  streak: "var(--tangerine)",
  neutral: "var(--accent-2)",
};

/**
 * Floats a `+12 XP` / `-7 Elo` / `+1 STREAK` style number upward with a
 * pop and fade. Fires once per `triggerKey`.
 */
export function FloatingDelta({
  triggerKey,
  amount,
  kind,
  label,
  className = "",
}: FloatingDeltaProps) {
  const incomingKey =
    triggerKey === null || triggerKey === undefined ? null : String(triggerKey);

  // Derive the visible key from props during render (React-recommended pattern
  // to avoid the set-state-in-effect cascade). The effect only schedules the
  // hide-after-timeout side effect.
  const [trackedKey, setTrackedKey] = useState<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);
  if (incomingKey !== trackedKey) {
    setTrackedKey(incomingKey);
    if (incomingKey !== null) setVisible(incomingKey);
  }

  useEffect(() => {
    if (visible === null) return;
    const t = window.setTimeout(() => setVisible(null), 1500);
    return () => window.clearTimeout(t);
  }, [visible]);

  const color = KIND_COLOR[kind];
  const sign = amount > 0 ? "+" : "";
  const labelText =
    label ??
    (kind === "xp"
      ? "XP"
      : kind === "elo-up" || kind === "elo-down"
        ? "ELO"
        : kind === "streak"
          ? "STREAK"
          : "");

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 z-40 ${className}`}
    >
      <AnimatePresence>
        {visible ? (
          <motion.div
            key={visible}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: 1, y: -56, scale: 1.05 }}
            exit={{ opacity: 0, y: -90, scale: 0.9 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex -translate-x-1/2 items-baseline gap-1 text-3xl font-bold tabular-nums sm:text-4xl"
            style={{
              color,
              textShadow: `0 0 18px ${color}, 0 4px 0 rgba(0,0,0,0.5)`,
            }}
          >
            <span>
              {sign}
              {amount}
            </span>
            {labelText ? (
              <span className="text-xs font-bold uppercase tracking-[0.3em]">
                {labelText}
              </span>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
