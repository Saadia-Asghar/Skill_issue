import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { DeansList } from "@/components/colosseum/deans-list";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import { DEANS_LIST_SIZE } from "@/lib/colosseum/constants";
import { getDeansList, getMyLeaderboardRow } from "@/lib/colosseum/queries";

export const dynamic = "force-dynamic";

export default async function DeansListPage() {
  const { userId } = await auth();
  const [entries, me] = await Promise.all([
    getDeansList(DEANS_LIST_SIZE),
    userId ? getMyLeaderboardRow(userId) : Promise.resolve(null),
  ]);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <SectionHeading
        eyebrow="★ Global High Scores ★"
        title={
          <>
            DEAN&apos;S LIST{" "}
            <span className="ml-3 text-2xl font-bold text-muted">
              top {DEANS_LIST_SIZE.toLocaleString()} by elo
            </span>
          </>
        }
        subtitle={
          <>
            Ranked solely on Daily Drop performance. K-factor settles after 30
            ranked attempts so a single bad day can&apos;t crater a top spot.
          </>
        }
      />

      {podium.length > 0 && (
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {podium.map((p, i) => (
            <PodiumCard
              key={p.clerk_id}
              entry={p}
              place={(i + 1) as 1 | 2 | 3}
            />
          ))}
        </section>
      )}

      <section className="mt-10">
        <GameCard skin="ink" className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--gold)" }}
            >
              ▸ RANKS {podium.length + 1}–
              {Math.min(DEANS_LIST_SIZE, entries.length)}
            </h2>
            <Link
              href="/colosseum"
              className="text-xs font-bold underline-offset-2 hover:underline"
              style={{ color: "var(--lime)" }}
            >
              ← back to colosseum
            </Link>
          </div>
          <DeansList
            entries={rest}
            me={me}
            highlightId={userId ?? undefined}
          />
        </GameCard>
      </section>
    </div>
  );
}

function PodiumCard({
  entry,
  place,
}: {
  entry: Awaited<ReturnType<typeof getDeansList>>[number];
  place: 1 | 2 | 3;
}) {
  const palettes = {
    1: { color: "var(--gold)", label: "1ST", icon: "★", skin: "gold" as const },
    2: { color: "var(--silver)", label: "2ND", icon: "◆", skin: "default" as const },
    3: { color: "var(--bronze)", label: "3RD", icon: "▲", skin: "tangerine" as const },
  } as const;
  const p = palettes[place];
  const isFirst = place === 1;
  return (
    <GameCard
      skin={p.skin}
      pulse={isFirst}
      className="overflow-hidden p-5"
      style={
        {
          transform: isFirst ? "translateY(-8px)" : undefined,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between">
        <span
          className="inline-flex h-8 items-center justify-center gap-1 rounded-xl px-3 text-xs font-extrabold tracking-widest"
          style={{
            background: p.color,
            color: "#1a0f00",
            border: "2px solid rgba(0,0,0,0.4)",
            boxShadow: "0 3px 0 0 rgba(0,0,0,0.4)",
          }}
        >
          {p.icon} {p.label}
        </span>
        <span
          className="rounded-full border-2 px-2.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
          style={{
            background: "var(--surface)",
            borderColor: p.color,
            color: p.color,
          }}
        >
          ELO {entry.elo.toLocaleString()}
        </span>
      </div>
      <div className="mt-5 flex items-center gap-3">
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt={entry.username ?? ""}
            className="h-12 w-12 rounded-xl object-cover ring-2"
            style={
              {
                ["--tw-ring-color" as string]: p.color,
              } as React.CSSProperties
            }
          />
        ) : (
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 text-base font-extrabold"
            style={{
              background: "var(--surface)",
              borderColor: p.color,
              color: p.color,
            }}
          >
            {(entry.username ?? "?").slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-bold">
            {entry.username ?? "Anonymous Scholar"}
          </p>
          <p className="text-xs text-muted">
            {entry.tier} · {entry.xp.toLocaleString()} XP
          </p>
        </div>
      </div>
    </GameCard>
  );
}
