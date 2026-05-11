import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeansList } from "@/components/colosseum/deans-list";
import { DropCountdown } from "@/components/colosseum/drop-countdown";
import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard, type GameCardSkin } from "@/components/game/game-card";
import {
  fetchDailyDrop,
  fetchRankedAttempt,
  fetchRecentAttempt,
  getDeansList,
  getMyLeaderboardRow,
} from "@/lib/colosseum/queries";
import { todayUtc } from "@/lib/colosseum/xp";
import { countDueToday } from "@/lib/flashcards/queries";
import { fetchMyEpisodes } from "@/lib/radio/queries";
import { rankProgress } from "@/lib/rank";
import type { RadioEpisodeRow, UserRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function ensureUserRow(): Promise<UserRow | null> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  if (!host) return null;
  const res = await fetch(`${proto}://${host}/api/users/sync`, {
    method: "POST",
    headers: { cookie: h.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { user: UserRow };
  return json.user;
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await ensureUserRow();

  const today = todayUtc();
  const [
    drop,
    leaderboard,
    me,
    todaysRanked,
    recentAttempt,
    flashcardsDue,
    radioEpisodes,
  ] = await Promise.all([
    fetchDailyDrop(today),
    getDeansList(5),
    getMyLeaderboardRow(userId),
    fetchRankedAttempt(userId, today),
    fetchRecentAttempt(userId),
    countDueToday(userId).catch(() => 0),
    fetchMyEpisodes(userId).catch(() => [] as RadioEpisodeRow[]),
  ]);
  const latestRadio = radioEpisodes[0] ?? null;

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <GameCard skin="magenta" className="p-8">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4em]"
            style={{ color: "var(--magenta)" }}
          >
            ▌ system fault ▌
          </p>
          <h1 className="mt-3 text-3xl font-bold">Couldn&apos;t load profile</h1>
          <p className="mt-3 text-muted">
            We couldn&apos;t reach the Fingerprint DB. Check that{" "}
            <code className="font-mono text-[color:var(--lime)]">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and your Clerk keys are set, and that the Clerk &lt;-&gt; Supabase
            third-party auth integration is configured.
          </p>
        </GameCard>
      </div>
    );
  }

  const progress = rankProgress(profile.xp, profile.rank);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.4em]"
              style={{ color: "var(--gold)" }}
            >
              ◉ player one · ready
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
              {profile.username ?? "Anonymous Scholar"}
            </h1>
          </div>
          <div
            className="flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xs font-bold"
            style={{
              background: "var(--surface)",
              borderColor: "var(--lime)",
              color: "var(--lime)",
              boxShadow: "0 4px 0 0 #3d7a00",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: "var(--lime)",
                boxShadow: "0 0 10px 0 var(--lime)",
              }}
            />
            FINGERPRINT DB ONLINE
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Elo Rating"
            value={profile.elo.toLocaleString()}
            sub={
              me
                ? `Dean's List #${me.rank}`
                : "Cognitive Colosseum"
            }
            accent="var(--accent-2)"
            icon="◆"
          />
          <StatCard
            label="Rank"
            value={profile.rank}
            sub={
              progress.next > progress.current
                ? `${profile.xp.toLocaleString()} / ${progress.next.toLocaleString()} XP`
                : "Max rank reached"
            }
            accent="var(--accent)"
            icon="♛"
            progress={progress.pct}
          />
          <StatCard
            label="Streak"
            value={`${profile.current_streak}d`}
            sub={
              todaysRanked
                ? "Today's drop secured"
                : "Run today's drop to keep it alive"
            }
            accent="var(--tangerine)"
            icon="🔥"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <DailyDropCard
            drop={drop}
            todaysRanked={!!todaysRanked}
            recent={recentAttempt}
          />

          <GameCard skin="ink" className="p-6">
            <div className="flex items-center justify-between">
              <h2
                className="text-base font-bold tracking-tight"
                style={{ color: "var(--gold)" }}
              >
                ★ DEAN&apos;S LIST
              </h2>
              <Link
                href="/colosseum/deans-list"
                className="text-xs font-bold underline-offset-2 hover:underline"
                style={{ color: "var(--lime)" }}
              >
                top 500 →
              </Link>
            </div>
            <p
              className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-muted"
            >
              Top 5 by Elo
            </p>
            <div className="mt-4">
              <DeansList
                entries={leaderboard}
                me={me}
                highlightId={userId}
                compact
              />
            </div>
          </GameCard>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <QuestTile
            skin="cyan"
            icon="▦"
            label="Flashcards due"
            value={flashcardsDue.toLocaleString()}
            sub={
              flashcardsDue > 0
                ? "Quick recall · Leitner-spaced"
                : "All caught up — run a drop to forge more"
            }
            cta={{ href: "/flashcards", label: "Review now →" }}
            accent="var(--accent-2)"
          />
          <RadioCard episode={latestRadio} />
          <ArenaCard />
        </section>

        <section>
          <GameCard skin="purple" className="p-7">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.4em]"
              style={{ color: "var(--gold)" }}
            >
              ◐ free-play sandbox
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Drop any concept. Any persona. Unlimited XP.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              The Synthesis Engine takes anything you paste and runs it
              through your favorite influencer. Three Socratic questions,
              sharper re-explanations on every miss. XP only — the Daily
              Drop is the only ranked surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ArcadeLink href="/learn" skin="lime" size="md">
                ▶ open synthesis engine
              </ArcadeLink>
              <ArcadeLink href="/blitz" skin="magenta" size="md">
                ⚔ find a blitz match
              </ArcadeLink>
              <ArcadeLink href="/rooms" skin="cyan" size="md">
                ◇ open a study room
              </ArcadeLink>
            </div>
          </GameCard>
        </section>

        <footer className="text-center text-xs text-muted">
          <Link href="/" className="font-bold underline-offset-2 hover:underline">
            ← back to landing
          </Link>
        </footer>
      </div>
    </div>
  );
}

function DailyDropCard({
  drop,
  todaysRanked,
  recent,
}: {
  drop: Awaited<ReturnType<typeof fetchDailyDrop>>;
  todaysRanked: boolean;
  recent: Awaited<ReturnType<typeof fetchRecentAttempt>>;
}) {
  return (
    <GameCard
      skin={todaysRanked ? "lime" : "purple"}
      pulse={!todaysRanked}
      className="md:col-span-2 overflow-hidden p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full border-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--gold)",
              color: "var(--gold)",
            }}
          >
            ◆ today&apos;s daily drop
          </span>
          {todaysRanked && (
            <span
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
              style={{
                background: "var(--lime)",
                color: "#0a1f00",
                boxShadow: "0 3px 0 0 #3d7a00",
              }}
            >
              ✓ ranked locked
            </span>
          )}
        </div>
        <span className="flex items-center gap-2 text-xs font-bold text-muted">
          NEXT IN <DropCountdown />
        </span>
      </div>

      {drop ? (
        <>
          <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight">
            {drop.concept.title}
          </h2>
          <p className="mt-3 line-clamp-3 text-sm text-muted">
            {drop.concept.text}
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-5 text-3xl font-bold tracking-tight">
            The drop hasn&apos;t loaded yet.
          </h2>
          <p className="mt-2 text-sm text-muted">
            First request after midnight UTC generates today&apos;s questions.
          </p>
        </>
      )}

      {recent && (
        <p className="mt-4 text-xs">
          <span className="font-bold uppercase tracking-widest text-muted">
            Last run
          </span>{" "}
          <span className="font-bold">
            {recent.correct_count}/{recent.total_count}
          </span>{" "}
          · {recent.elapsed_seconds}s ·{" "}
          <span
            className="font-bold"
            style={{
              color:
                recent.elo_delta > 0
                  ? "var(--lime)"
                  : recent.elo_delta < 0
                    ? "var(--magenta)"
                    : "var(--muted)",
            }}
          >
            {recent.elo_delta > 0 ? "+" : ""}
            {recent.elo_delta} Elo
          </span>
          {", "}
          <span className="font-bold" style={{ color: "var(--gold)" }}>
            +{recent.xp_awarded} XP
          </span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ArcadeLink href="/colosseum/play" skin="lime" size="md">
          {todaysRanked ? "▶ play unranked re-take" : "▶ enter the colosseum"}
        </ArcadeLink>
        <Link
          href="/colosseum"
          className="text-xs font-bold underline-offset-2 hover:underline"
          style={{ color: "var(--gold)" }}
        >
          view lobby →
        </Link>
      </div>
    </GameCard>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  progress,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: string;
  progress?: number;
}) {
  return (
    <div
      className="game-card relative overflow-hidden p-5"
      style={
        {
          "--shadow": accent,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {label}
        </p>
        <span
          className="text-2xl"
          style={{ color: accent, textShadow: `0 0 12px ${accent}` }}
        >
          {icon}
        </span>
      </div>
      <p
        className="mt-2 text-4xl font-extrabold tabular-nums leading-none"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted">{sub}</p>
      {typeof progress === "number" && (
        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full border-2"
          style={{
            background: "var(--surface-2)",
            borderColor: "rgba(0,0,0,0.4)",
          }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${accent}, var(--lime))`,
              boxShadow: `0 0 10px 0 ${accent}`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function QuestTile({
  skin,
  icon,
  label,
  value,
  sub,
  cta,
  accent,
}: {
  skin: GameCardSkin;
  icon: string;
  label: string;
  value: string;
  sub: string;
  cta: { href: string; label: string };
  accent: string;
}) {
  return (
    <GameCard skin={skin} className="p-5">
      <div className="flex items-start justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {label}
        </p>
        <span
          className="text-2xl"
          style={{ color: accent, textShadow: `0 0 12px ${accent}` }}
        >
          {icon}
        </span>
      </div>
      <p
        className="mt-2 text-3xl font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
      <Link
        href={cta.href}
        className="mt-4 inline-flex text-xs font-bold underline-offset-2 hover:underline"
        style={{ color: accent }}
      >
        {cta.label}
      </Link>
    </GameCard>
  );
}

function RadioCard({ episode }: { episode: RadioEpisodeRow | null }) {
  if (!episode) {
    return (
      <QuestTile
        skin="purple"
        icon="◉"
        label="Professor Radio"
        value="0"
        sub="Turn your notes into a 5-minute multi-persona podcast."
        cta={{ href: "/radio", label: "Cut your first episode →" }}
        accent="var(--accent)"
      />
    );
  }
  return (
    <GameCard skin="purple" className="p-5">
      <div className="flex items-start justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--accent)" }}
        >
          Latest radio
        </p>
        <span
          className="text-2xl"
          style={{ color: "var(--accent)", textShadow: "0 0 12px var(--accent)" }}
        >
          ◉
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-lg font-bold">{episode.title}</p>
      <p className="mt-1 text-xs text-muted">
        {episode.status === "ready"
          ? `${Math.max(1, Math.round((episode.duration_seconds ?? 0) / 60))} min · ready to play`
          : `Status: ${episode.status}`}
      </p>
      <Link
        href="/radio"
        className="mt-4 inline-flex text-xs font-bold underline-offset-2 hover:underline"
        style={{ color: "var(--accent)" }}
      >
        Open the studio →
      </Link>
    </GameCard>
  );
}

function ArenaCard() {
  return (
    <GameCard skin="magenta" className="p-5">
      <div className="flex items-start justify-between">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--magenta)" }}
        >
          Live arena
        </p>
        <span
          className="text-2xl"
          style={{
            color: "var(--magenta)",
            textShadow: "0 0 12px var(--magenta)",
          }}
        >
          ⚔
        </span>
      </div>
      <p className="mt-2 text-lg font-bold">1v1 Blitz · Study Rooms</p>
      <p className="mt-1 text-xs text-muted">
        Race a stranger or invite friends with a 6-digit code.
      </p>
      <div className="mt-3 flex gap-3 text-xs font-bold">
        <Link
          href="/blitz"
          className="underline-offset-2 hover:underline"
          style={{ color: "var(--magenta)" }}
        >
          Blitz →
        </Link>
        <Link
          href="/rooms"
          className="underline-offset-2 hover:underline"
          style={{ color: "var(--magenta)" }}
        >
          Rooms →
        </Link>
      </div>
    </GameCard>
  );
}
