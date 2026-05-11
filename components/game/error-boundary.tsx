"use client";

import { Component, type ReactNode } from "react";

import { ArcadeButton } from "./arcade-button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/**
 * Catches any React render error in the subtree and shows a playful
 * arcade-style "GAME OVER" screen instead of a white screen of death.
 *
 * Used to wrap the entire `<main>` in `app/layout.tsx`.
 */
export class GameOverBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "Unknown crash",
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[GameOverBoundary]", error, info);
    }
  }

  reset = () => {
    this.setState({ hasError: false, message: null });
  };

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.4em]"
          style={{ color: "var(--magenta)" }}
        >
          ▌▌  System fault  ▌▌
        </p>
        <h1
          className="mt-6 text-7xl font-bold tracking-tight"
          style={{
            background:
              "linear-gradient(135deg, var(--magenta), var(--gold) 60%, var(--lime))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 40px rgba(240, 56, 107, 0.45)",
          }}
        >
          GAME OVER
        </h1>
        <p className="mt-6 max-w-md text-base text-muted">
          Something cracked open in the cabinet. The arcade tech is on the way.
          {this.state.message ? (
            <>
              <br />
              <span className="mt-2 inline-block font-mono text-xs text-[color:var(--tangerine)]">
                {this.state.message}
              </span>
            </>
          ) : null}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <ArcadeButton skin="lime" onClick={this.reload} size="lg">
            ▶  PRESS START
          </ArcadeButton>
          <ArcadeButton skin="ghost" onClick={this.reset} size="md">
            try again here
          </ArcadeButton>
        </div>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.5em] text-muted/70">
          insert coin to continue · 00 credits
        </p>
      </div>
    );
  }
}
