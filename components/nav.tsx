import { Show, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { ArcadeLink } from "@/components/game/arcade-button";
import { countDueToday } from "@/lib/flashcards/queries";

export async function Nav() {
  const { userId } = await auth();
  const dueCount = userId ? await countDueToday(userId).catch(() => 0) : 0;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background:
          "linear-gradient(180deg, rgba(11, 8, 32, 0.85), rgba(11, 8, 32, 0.6))",
        borderBottom: "2px solid var(--border)",
      }}
    >
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
        >
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-2))",
              border: "2px solid rgba(0,0,0,0.35)",
              boxShadow:
                "0 4px 0 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            PD
          </span>
          <span className="text-base font-bold tracking-tight">
            Professor{" "}
            <span style={{ color: "var(--lime)" }}>Decompose</span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          <NavLink href="/colosseum" label="Colosseum" icon="★" />
          <NavLink href="/learn" label="Learn" icon="◐" />
          <Show when="signed-in">
            <NavLink href="/blitz" label="Blitz" icon="⚔" />
            <NavLink href="/rooms" label="Rooms" icon="◇" />
            <NavLink
              href="/flashcards"
              label="Cards"
              icon="▦"
              badge={dueCount > 0 ? (dueCount > 99 ? "99+" : String(dueCount)) : null}
            />
            <NavLink href="/radio" label="Radio" icon="◉" />
            <NavLink href="/dashboard" label="Hub" icon="♦" />
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "h-9 w-9 ring-2 ring-[color:var(--lime)]/60 rounded-xl",
                },
              }}
            />
          </Show>
          <Show when="signed-out">
            <NavLink href="/sign-in" label="Sign in" />
            <ArcadeLink href="/sign-up" skin="lime" size="sm">
              ▶ Enter Arena
            </ArcadeLink>
          </Show>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon?: string;
  badge?: string | null;
}) {
  return (
    <Link
      href={href}
      className="group relative inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold text-muted transition hover:bg-surface hover:text-foreground"
    >
      {icon ? (
        <span
          aria-hidden
          className="text-xs opacity-70 transition group-hover:opacity-100"
          style={{ color: "var(--gold)" }}
        >
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
      {badge ? (
        <span
          className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black"
          style={{
            background: "var(--lime)",
            boxShadow: "0 2px 0 0 #3d7a00",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
