import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Convenience: round the corners as a circle. */
  circle?: boolean;
}

/**
 * Shimmering loading placeholder. Uses the `.skeleton` keyframe defined in
 * `globals.css` so it respects `prefers-reduced-motion`.
 */
export function Skeleton({ className = "", style, circle = false }: SkeletonProps) {
  return (
    <span
      className={`skeleton inline-block ${circle ? "rounded-full" : ""} ${className}`}
      style={style}
      aria-hidden
    />
  );
}

/** Vertical stack of N text-line skeletons. */
export function SkeletonLines({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 w-full"
          style={{
            width: `${100 - i * 8}%`,
          }}
        />
      ))}
    </div>
  );
}

/** Skeleton tile shaped like our standard game-card. */
export function SkeletonCard({
  className = "",
  height = 180,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={`game-card flex flex-col gap-3 p-5 ${className}`}
      style={{
        minHeight: height,
        ["--shadow" as string]: "var(--border)",
      }}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-3/4" />
      <SkeletonLines lines={3} />
    </div>
  );
}
