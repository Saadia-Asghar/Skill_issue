"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

export interface PersonaCardData {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  isCreator?: boolean;
}

interface PersonaCardProps {
  persona: PersonaCardData;
  selected: boolean;
  onSelect?: (slug: string) => void;
  disabled?: boolean;
  /** Render as a chunkier "character select" tile (used in lobbies). */
  variant?: "tile" | "compact";
  className?: string;
}

/**
 * Animated persona selector. On select: pop-out + glowing border. Built with
 * Framer Motion's `whileHover`/`whileTap` for natural bounce, and a
 * persistent CSS halo when in the `selected` state.
 *
 * Reusable across:
 *   - Blitz lobby (character select)
 *   - Study Rooms persona toggles
 *   - Colosseum entry pick
 *   - Free-form Learn Studio
 */
export function PersonaCard({
  persona,
  selected,
  onSelect,
  disabled = false,
  variant = "tile",
  className = "",
}: PersonaCardProps) {
  const initials = persona.name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isTile = variant === "tile";
  const accent = persona.accentColor;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(persona.slug)}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.04, y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={
        selected
          ? { scale: 1.06, y: -4 }
          : { scale: 1, y: 0 }
      }
      transition={{ type: "spring", stiffness: 360, damping: 22 }}
      className={`group relative w-full text-left ${className}`}
      style={
        {
          background: "transparent",
          border: "none",
          padding: 0,
        } as CSSProperties
      }
      aria-pressed={selected}
    >
      <div
        className="game-card relative overflow-hidden"
        style={
          {
            "--skin": selected
              ? `color-mix(in srgb, ${accent} 35%, var(--surface))`
              : "var(--surface)",
            "--shadow": selected
              ? accent
              : "var(--border)",
            padding: isTile ? "1rem 1rem 1.1rem" : "0.75rem 0.85rem",
            borderColor: selected ? accent : "rgba(0,0,0,0.25)",
            boxShadow: selected
              ? `0 8px 0 0 ${accent}, 0 0 32px 4px ${accent}66, inset 0 0 0 2px ${accent}`
              : undefined,
          } as CSSProperties
        }
      >
        {/* glow halo when selected */}
        {selected ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-[inherit] opacity-50 blur-xl"
            style={{ background: accent }}
          />
        ) : null}

        <div className="relative flex items-center gap-3">
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-xl font-extrabold text-white ${
              isTile ? "h-12 w-12 text-base" : "h-9 w-9 text-xs"
            }`}
            style={{
              background: accent,
              border: "2px solid rgba(0,0,0,0.35)",
              boxShadow: `0 4px 0 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)`,
            }}
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={`truncate font-bold text-foreground ${isTile ? "text-base" : "text-sm"}`}
              >
                {persona.name}
              </p>
              {persona.isCreator ? (
                <span
                  className="rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-widest"
                  style={{
                    background: "color-mix(in srgb, var(--gold) 18%, transparent)",
                    color: "var(--gold)",
                  }}
                >
                  hero
                </span>
              ) : null}
            </div>
            <p
              className={`mt-0.5 truncate text-muted ${isTile ? "text-xs" : "text-[11px]"}`}
            >
              {persona.tagline}
            </p>
          </div>
          {selected ? (
            <span
              aria-hidden
              className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{
                background: accent,
                border: "2px solid rgba(0,0,0,0.35)",
                boxShadow: "0 3px 0 0 rgba(0,0,0,0.4)",
              }}
            >
              ✓
            </span>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}
