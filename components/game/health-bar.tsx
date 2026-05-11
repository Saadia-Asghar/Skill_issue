"use client";

import type { CSSProperties } from "react";

interface HealthBarProps {
  /** 0..max correct answers. */
  current: number;
  max: number;
  color: string;
  /** Drives the chevron direction visualization. */
  direction?: "ltr" | "rtl";
  label?: string;
  className?: string;
}

/**
 * Visual "health bar" used in the 1v1 Blitz arena. Shows N segments;
 * filled = correct answers landed. Looks like a fighting-game stamina meter.
 *
 * `direction="rtl"` drains from the right — used for the opponent on the
 * mirrored side of the split-screen so the two bars meet in the middle.
 */
export function HealthBar({
  current,
  max,
  color,
  direction = "ltr",
  label,
  className = "",
}: HealthBarProps) {
  const segments = Array.from({ length: max }, (_, i) => i);
  const isRtl = direction === "rtl";
  return (
    <div className={`flex flex-col gap-1.5 ${isRtl ? "items-end" : ""} ${className}`}>
      {label ? (
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          {label}
        </span>
      ) : null}
      <div
        className={`flex gap-1 ${isRtl ? "flex-row-reverse" : ""}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-label={label ?? "score"}
      >
        {segments.map((i) => {
          const filled = i < current;
          const segmentStyle: CSSProperties = filled
            ? {
                background: color,
                boxShadow: `0 0 12px 0 ${color}aa, inset 0 1px 0 rgba(255,255,255,0.45)`,
                borderColor: "rgba(0,0,0,0.45)",
              }
            : {
                background: "var(--surface-2)",
                borderColor: "rgba(0,0,0,0.4)",
              };
          return (
            <span
              key={i}
              className={`h-3.5 w-12 rounded-md border-2 transition-all duration-300 ${
                filled ? "scale-100" : "scale-95 opacity-70"
              }`}
              style={segmentStyle}
            />
          );
        })}
      </div>
    </div>
  );
}
