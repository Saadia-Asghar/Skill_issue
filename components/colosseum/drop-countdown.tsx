"use client";

import { useEffect, useState } from "react";

import { millisUntilNextDrop } from "@/lib/colosseum/xp";

/**
 * Live countdown to the next UTC midnight Daily Drop. Updates every second
 * client-side; renders nothing fancy server-side to avoid hydration drift.
 */
export function DropCountdown({ className }: { className?: string }) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMs(millisUntilNextDrop());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (ms === null) {
    return (
      <span
        className={
          className ??
          "font-mono text-sm tabular-nums text-muted"
        }
      >
        --:--:--
      </span>
    );
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");

  return (
    <span
      className={
        className ?? "font-mono text-sm tabular-nums text-foreground"
      }
    >
      {h}:{m}:{s}
    </span>
  );
}
