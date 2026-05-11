"use client";

import { useEffect, useRef, useState } from "react";

import { ArcadeButton } from "@/components/game/arcade-button";

export function ArenaMusicToggle() {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      ctxRef.current = ctx;
    }
    await ctx.resume();

    setEnabled(true);
    pulseTone(ctx, 174.61, 0.06);
    timerRef.current = window.setInterval(() => {
      const seq = [174.61, 196, 220, 246.94, 220, 196];
      const note = seq[Math.floor(Math.random() * seq.length)] ?? 196;
      pulseTone(ctx!, note, 0.04);
    }, 850);
  };

  return (
    <ArcadeButton skin={enabled ? "gold" : "ghost"} size="sm" onClick={toggle}>
      {enabled ? "Music On" : "Music Off"}
    </ArcadeButton>
  );
}

function pulseTone(ctx: AudioContext, frequency: number, gainAmount: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  gain.gain.value = 0.001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(gainAmount, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  osc.start(t);
  osc.stop(t + 0.48);
}
