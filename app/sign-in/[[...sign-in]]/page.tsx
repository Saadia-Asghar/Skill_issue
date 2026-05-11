import { SignIn } from "@clerk/nextjs";

import { GameCard } from "@/components/game/game-card";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.5em]"
            style={{ color: "var(--gold)" }}
          >
            ▶ press start
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            Insert <span style={{ color: "var(--lime)" }}>player</span>
          </h1>
        </div>
        <GameCard skin="purple" className="p-6">
          <SignIn />
        </GameCard>
      </div>
    </div>
  );
}
