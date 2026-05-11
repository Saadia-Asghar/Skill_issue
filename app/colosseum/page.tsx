import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { DeansList } from "@/components/colosseum/deans-list";
import { DifficultyPip } from "@/components/colosseum/difficulty-pip";
import { DropCountdown } from "@/components/colosseum/drop-countdown";
import { ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { SectionHeading } from "@/components/game/section-heading";
import { conceptElo } from "@/lib/colosseum/elo";
import {
  fetchDailyDrop,
  fetchRankedAttempt,
  fetchRecentAttempt,
  getDeansList,
  getMyLeaderboardRow,
} from "@/lib/colosseum/queries";
import { todayUtc } from "@/lib/colosseum/xp";
import { getAnonServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PREVIEW_LEADERBOARD = 10;

export default async function ColosseumLobby() {
  const { userId } = await auth();
  const today = todayUtc();

  const [drop, leaderboard, me, todaysAttempt, recent, profile] =
    await Promise.all([
      fetchDailyDrop(today),
      getDeansList(PREVIEW_LEADERBOARD),
      userId ? getMyLeaderboardRow(userId) : Promise.resolve(null),
      userId ? fetchRankedAttempt(userId, today) : Promise.resolve(null),
      userId ? fetchRecentAttempt(userId) : Promise.resolve(null),
      userId ? fetchProfileLite(userId) : Promise.resolve(null),
    ]);

  const dropTeaser = drop?.concept.text.slice(0, 220) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <SectionHeading
        eyebrow="The Cognitive Colosseum"
        title={
          <>
            One concept. One global field.{" "}
            <span style={{ color: "var(--lime)" }}>Speed and accuracy.</span>
          </>
        }
        subtitle={
          <>
            Every UTC midnight a single concept drops worldwide. Pick the
            professor that explains it for you, then run the same canonical
            three-question gauntlet every other player faces. Speed and
            accuracy decide your Elo. Top 500 holds the Dean&apos;s List.
          </>
        }
      />

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <DropCard
          drop={drop}
          dropTeaser={dropTeaser}
          isSignedIn={!!userId}
          alreadyRanked={!!todaysAttempt}
        />

        <div className="flex flex-col gap-4">
          <StatsCard
            isSignedIn={!!userId}
            elo={profile?.elo ?? null}
            xp={profile?.xp ?? null}
            streak={profile?.current_streak ?? null}
            tier={profile?.rank ?? null}
            myRank={me?.rank ?? null}
            recent={recent}
          />
        </div>
      </section>

      <section className="mt-10">
        <GameCard skin="ink" className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.4em]"
                style={{ color: "var(--gold)" }}
              >
                ★ Dean&apos;s List · High Scores ★
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                TOP 10 BY ELO
              </h2>
            </div>
            <Link
              href="/colosseum/deans-list"
              className="text-xs font-bold underline-offset-2 hover:underline"
              style={{ color: "var(--lime)" }}
            >
              VIEW TOP 500 →
            </Link>
          </div>
          <DeansList
            entries={leaderboard}
            me={me}
            highlightId={userId ?? undefined}
          />
        </GameCard>
      </section>
    </div>
  );
}

function DropCard({
  drop,
  dropTeaser,
  isSignedIn,
  alreadyRanked,
}: {
  drop: Awaited<ReturnType<typeof fetchDailyDrop>>;
  dropTeaser: string | null;
  isSignedIn: boolean;
  alreadyRanked: boolean;
}) {
  return (
    <GameCard skin="purple" pulse className="overflow-hidden p-7">
      {/* corner ribbon */}
      <div
        className="absolute -right-12 top-5 rotate-45 px-12 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-black"
        style={{
          background: "var(--gold)",
          boxShadow: "0 4px 0 0 rgba(0,0,0,0.45)",
        }}
      >
        Today&apos;s Quest
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="rounded-full border-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--gold)",
            color: "var(--gold)",
          }}
        >
          ◆ Drop · {drop?.drop_date ?? "pending"}
        </span>
        <span className="flex items-center gap-2 text-xs font-bold text-muted">
          NEXT DROP IN <DropCountdown />
        </span>
      </div>

      {drop ? (
        <>
          <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {drop.concept.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <DifficultyPip difficulty={drop.concept.difficulty} />
            <span
              className="rounded-full border-2 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: "color-mix(in srgb, var(--magenta) 20%, transparent)",
                borderColor: "var(--magenta)",
                color: "var(--magenta)",
              }}
            >
              opp Elo {conceptElo(drop.concept.difficulty)}
            </span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            {dropTeaser}
            {dropTeaser && drop.concept.text.length > dropTeaser.length
              ? "..."
              : ""}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {isSignedIn ? (
              <ArcadeLink href="/colosseum/play" skin="lime" size="lg">
                {alreadyRanked
                  ? "▶ PLAY UNRANKED RE-TAKE"
                  : "▶ ENTER THE COLOSSEUM"}
              </ArcadeLink>
            ) : (
              <ArcadeLink href="/sign-up" skin="lime" size="lg">
                ▶ SIGN UP TO ENTER
              </ArcadeLink>
            )}
            {alreadyRanked && (
              <span className="text-xs text-muted">
                You already locked in a ranked run today. Re-takes are
                unranked but still award XP.
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            The drop hasn&apos;t loaded yet.
          </h2>
          <p className="mt-3 text-sm text-muted">
            The first request after UTC midnight generates the day&apos;s
            canonical questions. Hit refresh in a moment.
          </p>
        </>
      )}
    </GameCard>
  );
}

function StatsCard({
  isSignedIn,
  elo,
  xp,
  streak,
  tier,
  myRank,
  recent,
}: {
  isSignedIn: boolean;
  elo: number | null;
  xp: number | null;
  streak: number | null;
  tier: string | null;
  myRank: number | null;
  recent: Awaited<ReturnType<typeof fetchRecentAttempt>>;
}) {
  if (!isSignedIn) {
    return (
      <GameCard className="p-6">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--gold)" }}
        >
          Your stats
        </p>
        <p className="mt-3 text-sm text-muted">
          Sign in to track your Elo, streak, and XP. The Daily Drop is open
          for ranked play once you&apos;ve got a profile.
        </p>
        <ArcadeLink
          href="/sign-up"
          skin="lime"
          size="md"
          className="mt-5"
        >
          ▶ Create profile
        </ArcadeLink>
      </GameCard>
    );
  }
  return (
    <GameCard className="flex flex-col gap-4 p-6">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "var(--gold)" }}
      >
        Your stats
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Elo" value={elo?.toLocaleString() ?? "—"} accent="var(--accent-2)" />
        <Stat
          label="Streak"
          value={typeof streak === "number" ? `${streak}d` : "—"}
          accent="var(--tangerine)"
        />
        <Stat
          label="XP"
          value={xp ? short(xp) : "—"}
          accent="var(--gold)"
        />
      </div>
      <div
        className="rounded-xl border-2 px-4 py-3 text-xs"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        <p>
          <span className="font-bold uppercase tracking-widest text-muted">Rank</span>{" "}
          <span className="font-bold">{tier ?? "—"}</span>
          {myRank !== null && (
            <>
              {" · "}
              <span className="font-bold uppercase tracking-widest text-muted">
                Dean&apos;s List
              </span>{" "}
              <span className="font-mono font-bold" style={{ color: "var(--gold)" }}>
                #{myRank}
              </span>
            </>
          )}
        </p>
        {recent ? (
          <p className="mt-2 text-muted">
            Last run: <span className="font-bold text-foreground">{recent.correct_count}/{recent.total_count}</span> ·{" "}
            {recent.elapsed_seconds}s ·{" "}
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
        ) : (
          <p className="mt-2 text-muted">
            No runs logged yet. Today&apos;s drop is your first move.
          </p>
        )}
      </div>
    </GameCard>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border-2 px-3 py-3 text-center"
      style={{
        background: "var(--surface-2)",
        borderColor: "rgba(0,0,0,0.3)",
        boxShadow: `0 4px 0 0 ${accent}`,
      }}
    >
      <p
        className="text-[9px] font-bold uppercase tracking-[0.3em]"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}

function short(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

async function fetchProfileLite(clerkId: string) {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("users")
    .select("elo, xp, current_streak, rank")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  return data;
}
