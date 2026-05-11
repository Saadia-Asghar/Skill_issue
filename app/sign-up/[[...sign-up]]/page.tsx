import { SignUp } from "@clerk/nextjs";

import { GameCard } from "@/components/game/game-card";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ✦ new game
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            Forge your <span style={{ color: "var(--accent-2)" }}>profile</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick a name. We&apos;ll handle the Elo, the streak, and the
            fingerprint.
          </p>
        </div>
        <GameCard skin="cyan" className="p-6">
          <SignUp />
        </GameCard>
      </div>
    </div>
  );
}
