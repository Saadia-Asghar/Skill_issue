"use client";

import * as React from "react";

/**
 * Demo-mode replacement for `@clerk/nextjs` (client surface).
 *
 * Turbopack aliases `@clerk/nextjs` to this file when `DEMO_MODE=1`. Every
 * Clerk client primitive (`<ClerkProvider>`, `<Show>`, `<UserButton>`,
 * `<SignIn>`, `<SignUp>`, `useUser`, `useSession`) becomes a thin stub that
 * pretends a fixed "demo" user is signed in.
 */

export const DEMO_USER_ID = "demo_user_local";

const DEMO_USER = {
  id: DEMO_USER_ID,
  username: "demo",
  firstName: "Demo",
  lastName: "Player",
  fullName: "Demo Player",
  imageUrl: "",
  primaryEmailAddress: { emailAddress: "demo@local.dev", id: "ema_demo" },
  emailAddresses: [{ emailAddress: "demo@local.dev", id: "ema_demo" }],
};

const DEMO_SESSION = {
  id: "demo_session_local",
  user: DEMO_USER,
  status: "active" as const,
  getToken: async () => null,
};

export function ClerkProvider({
  children,
}: {
  children: React.ReactNode;
  appearance?: unknown;
}) {
  return <>{children}</>;
}

export function Show({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: React.ReactNode;
}) {
  return when === "signed-in" ? <>{children}</> : null;
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SignedOut(_props: { children: React.ReactNode }) {
  return null;
}

export function UserButton(_props: {
  appearance?: unknown;
  afterSignOutUrl?: string;
}) {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-1"
      style={{
        background: "linear-gradient(135deg, #a855f7, #06b6d4)",
        boxShadow: "0 0 0 1px rgba(168, 85, 247, 0.4)",
      }}
      title="Demo mode — Clerk is bypassed"
    >
      D
    </div>
  );
}

export function SignInButton(props: {
  children?: React.ReactNode;
  mode?: "redirect" | "modal";
}) {
  return (
    <span title="Demo mode — sign-in disabled">
      {props.children ?? "Sign in"}
    </span>
  );
}

export function SignUpButton(props: {
  children?: React.ReactNode;
  mode?: "redirect" | "modal";
}) {
  return (
    <span title="Demo mode — sign-up disabled">
      {props.children ?? "Sign up"}
    </span>
  );
}

export function SignIn(_props: unknown) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <p className="text-lg font-semibold text-foreground">Demo mode is on.</p>
      <p className="mt-2 max-w-md text-sm text-muted">
        Clerk auth is bypassed. You&apos;re already &quot;signed in&quot; as the
        demo user. Set <code>DEMO_MODE=0</code> and add real Clerk keys to{" "}
        <code>.env.local</code> to use real auth.
      </p>
    </div>
  );
}

export function SignUp(_props: unknown) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <p className="text-lg font-semibold text-foreground">Demo mode is on.</p>
      <p className="mt-2 max-w-md text-sm text-muted">
        Clerk auth is bypassed. The demo user is created automatically.
      </p>
    </div>
  );
}

export function useUser() {
  return {
    user: DEMO_USER,
    isLoaded: true,
    isSignedIn: true,
  };
}

export function useSession() {
  return {
    session: DEMO_SESSION,
    isLoaded: true,
    isSignedIn: true,
  };
}

export function useAuth() {
  return {
    userId: DEMO_USER_ID,
    sessionId: "demo_session_local",
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => null,
  };
}

export function useClerk() {
  return {
    signOut: async () => undefined,
    openSignIn: () => undefined,
    openSignUp: () => undefined,
  };
}
