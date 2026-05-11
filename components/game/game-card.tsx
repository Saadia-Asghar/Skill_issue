"use client";

import type { CSSProperties, ReactNode } from "react";

export type GameCardSkin =
  | "default"
  | "purple"
  | "cyan"
  | "lime"
  | "gold"
  | "magenta"
  | "tangerine"
  | "ink";

const SKINS: Record<GameCardSkin, { skin: string; shadow: string }> = {
  default: { skin: "var(--surface)", shadow: "var(--border)" },
  purple: { skin: "color-mix(in srgb, var(--accent) 22%, var(--surface))", shadow: "#3a1c80" },
  cyan: { skin: "color-mix(in srgb, var(--accent-2) 22%, var(--surface))", shadow: "#0e5b73" },
  lime: { skin: "color-mix(in srgb, var(--lime) 22%, var(--surface))", shadow: "#3d7a00" },
  gold: { skin: "color-mix(in srgb, var(--gold) 22%, var(--surface))", shadow: "#9a7c00" },
  magenta: { skin: "color-mix(in srgb, var(--magenta) 22%, var(--surface))", shadow: "#8d0a35" },
  tangerine: { skin: "color-mix(in srgb, var(--tangerine) 22%, var(--surface))", shadow: "#9a430b" },
  ink: { skin: "#0a071a", shadow: "#000" },
};

interface GameCardProps {
  skin?: GameCardSkin;
  pulse?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A chunky panel with the same physical-button depth as `ArcadeButton`.
 * Use for daily drops, persona tiles, scoreboards, results screens.
 */
export function GameCard({
  skin = "default",
  pulse = false,
  className = "",
  style,
  children,
}: GameCardProps) {
  const sk = SKINS[skin];
  return (
    <div
      className={`game-card ${pulse ? "pulse-quest" : ""} ${className}`}
      style={
        {
          "--skin": sk.skin,
          "--shadow": sk.shadow,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
