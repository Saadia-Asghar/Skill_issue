/**
 * 1-5 difficulty visual: chunky filled and unfilled pips with a label.
 */
export function DifficultyPip({
  difficulty,
  className,
}: {
  difficulty: number;
  className?: string;
}) {
  const clamped = Math.max(1, Math.min(5, Math.round(difficulty)));
  return (
    <span
      className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-muted ${className ?? ""}`}
    >
      <span className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const on = i < clamped;
          const color =
            i < 2 ? "var(--lime)" : i < 4 ? "var(--gold)" : "var(--magenta)";
          return (
            <span
              key={i}
              className="h-2.5 w-4 rounded-sm border-2"
              style={{
                background: on ? color : "var(--surface-2)",
                borderColor: "rgba(0,0,0,0.4)",
                boxShadow: on
                  ? `0 1.5px 0 0 rgba(0,0,0,0.4), 0 0 8px 0 ${color}`
                  : undefined,
              }}
            />
          );
        })}
      </span>
      <span>diff {clamped}/5</span>
    </span>
  );
}
