import Link from "next/link";

import type { LeaderboardEntry } from "@/lib/colosseum/queries";

/**
 * Retro arcade high-score table. Top three rows get a chunky gold/silver/
 * bronze badge with a depth shadow; the rest get a monospace rank number.
 *
 *   - `entries`              the top-N rows (already ranked)
 *   - `me`                   the viewer's row, pinned at the bottom if not in `entries`
 *   - `highlightId`          one clerk_id to visually highlight (e.g. "you")
 *   - `compact`              denser layout for sidebars
 */
export function DeansList({
  entries,
  me = null,
  highlightId,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  me?: LeaderboardEntry | null;
  highlightId?: string;
  compact?: boolean;
}) {
  const meIsInList =
    me && entries.some((e) => e.clerk_id === me.clerk_id);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {entries.map((row) => (
          <Row
            key={row.clerk_id}
            entry={row}
            highlight={!!highlightId && highlightId === row.clerk_id}
            compact={compact}
          />
        ))}
        {entries.length === 0 && (
          <li
            className="rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm text-muted"
            style={{ borderColor: "var(--border)" }}
          >
            ░░ The board is empty. Be the first. ░░
          </li>
        )}
      </ol>
      {me && !meIsInList && (
        <>
          <Divider />
          <Row entry={me} highlight compact={compact} />
        </>
      )}
    </div>
  );
}

function Row({
  entry,
  highlight,
  compact,
}: {
  entry: LeaderboardEntry;
  highlight: boolean;
  compact: boolean;
}) {
  const podium = entry.rank <= 3;
  const podiumColor = PODIUM_COLOR[entry.rank];
  const baseSkin = podium
    ? `color-mix(in srgb, ${podiumColor} 28%, var(--surface))`
    : highlight
      ? "color-mix(in srgb, var(--lime) 22%, var(--surface))"
      : "var(--surface)";
  const baseShadow = podium
    ? podiumColor
    : highlight
      ? "var(--lime)"
      : "var(--border)";

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 ${
        compact ? "py-2" : "py-3"
      }`}
      style={{
        background: baseSkin,
        borderColor: "rgba(0,0,0,0.3)",
        boxShadow: `0 4px 0 0 ${baseShadow}`,
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <RankBadge rank={entry.rank} />
        <Avatar
          url={entry.avatar_url}
          fallback={entry.username ?? "?"}
          highlight={podium}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {entry.username ?? "Anonymous Scholar"}
            {highlight ? (
              <span
                className="ml-2 rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-widest"
                style={{
                  background: "var(--lime)",
                  color: "#0a1f00",
                }}
              >
                you
              </span>
            ) : null}
          </p>
          <p className="text-[11px] text-muted">
            {entry.tier} · {entry.xp.toLocaleString()} XP
            {entry.current_streak > 0 ? ` · ${entry.current_streak}d 🔥` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className="font-mono text-base font-bold tabular-nums"
          style={{ color: podium ? podiumColor : "var(--foreground)" }}
        >
          {entry.elo.toLocaleString()}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted">
          ELO
        </span>
      </div>
    </li>
  );
}

const PODIUM_COLOR: Record<number, string> = {
  1: "var(--gold)",
  2: "var(--silver)",
  3: "var(--bronze)",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const color = PODIUM_COLOR[rank];
    const medal = rank === 1 ? "★" : rank === 2 ? "◆" : "▲";
    return (
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
        style={{
          background: color,
          color: "#1a0f00",
          border: "2px solid rgba(0,0,0,0.4)",
          boxShadow:
            "0 3px 0 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.55)",
        }}
        aria-label={`Rank ${rank}`}
      >
        {medal}
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 font-mono text-xs font-bold text-muted"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      }}
    >
      #{rank}
    </span>
  );
}

function Avatar({
  url,
  fallback,
  highlight = false,
}: {
  url: string | null;
  fallback: string;
  highlight?: boolean;
}) {
  const ring = highlight ? "ring-2 ring-[color:var(--gold)]" : "";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={fallback}
        className={`h-8 w-8 shrink-0 rounded-xl object-cover ${ring}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 text-[11px] font-extrabold ${ring}`}
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
        color: "var(--muted)",
      }}
    >
      {fallback
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase())
        .slice(0, 2)
        .join("")}
    </span>
  );
}

function Divider() {
  return (
    <div
      className="my-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.4em]"
      style={{ color: "var(--gold)" }}
    >
      <span className="h-0.5 flex-1" style={{ background: "var(--gold)" }} />
      <span>▸ your run ◂</span>
      <span className="h-0.5 flex-1" style={{ background: "var(--gold)" }} />
    </div>
  );
}

export function DeansListEmptyCta() {
  return (
    <Link
      href="/colosseum"
      className="text-xs font-bold underline-offset-2 hover:underline"
      style={{ color: "var(--gold)" }}
    >
      Be the first on the board →
    </Link>
  );
}
