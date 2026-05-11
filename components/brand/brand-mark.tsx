"use client";

import type { CSSProperties } from "react";

export function BrandMark({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center justify-center rounded-xl font-black text-white ${
          compact ? "h-9 w-9 text-sm" : "h-12 w-12 text-base"
        }`}
        style={
          {
            background:
              "radial-gradient(circle at 30% 30%, #5fd5ff, #2a94d8 55%, #155b8e)",
            border: "2px solid #9fdfff",
            boxShadow:
              "0 4px 0 0 rgba(8, 28, 52, 0.9), inset 0 1px 0 rgba(255,255,255,0.5)",
          } as CSSProperties
        }
      >
        SI
      </span>
      <span
        className={`rounded-lg border px-3 py-1 font-bold text-white ${
          compact ? "text-base" : "text-2xl"
        }`}
        style={{
          borderColor: "color-mix(in srgb, var(--ice-blue) 35%, var(--border-heavy))",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 80%, #0f172a), var(--bg-surface))",
        }}
      >
        Skill Issue
      </span>
    </div>
  );
}
