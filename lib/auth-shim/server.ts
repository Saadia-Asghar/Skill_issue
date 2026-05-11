import "server-only";

/**
 * Demo-mode replacement for `@clerk/nextjs/server`.
 *
 * When Turbopack aliases `@clerk/nextjs/server` to this module (driven by
 * `DEMO_MODE=1` in `next.config.ts`), every server-side `auth()`,
 * `currentUser()`, and `clerkMiddleware()` call resolves to a stable fake
 * "demo" identity. RLS-protected Supabase writes will fail (the demo JWT
 * isn't real) but every page renders so the UI can be previewed.
 *
 * Flip back to real Clerk by removing `DEMO_MODE=1` from `.env.local` and
 * filling in real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`.
 */

export const DEMO_USER_ID = "demo_user_local";

type DemoAuthObject = {
  userId: string;
  sessionId: string;
  sessionClaims: { sub: string };
  getToken: () => Promise<string | null>;
  protect: () => Promise<void>;
  redirectToSignIn: () => Promise<void>;
};

export async function auth(): Promise<DemoAuthObject> {
  return {
    userId: DEMO_USER_ID,
    sessionId: "demo_session_local",
    sessionClaims: { sub: DEMO_USER_ID },
    getToken: async () => null,
    protect: async () => undefined,
    redirectToSignIn: async () => undefined,
  };
}

export async function currentUser() {
  return {
    id: DEMO_USER_ID,
    username: "demo",
    firstName: "Demo",
    lastName: "Player",
    fullName: "Demo Player",
    imageUrl: "",
    primaryEmailAddress: { emailAddress: "demo@local.dev", id: "ema_demo" },
    emailAddresses: [{ emailAddress: "demo@local.dev", id: "ema_demo" }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

type Handler = (
  authFn: () => DemoAuthObject,
  req: Request,
) => Promise<Response | undefined> | Response | undefined;

export function clerkMiddleware(_handler?: Handler) {
  return async (_req: Request) => undefined;
}

export function createRouteMatcher(_patterns: string[] | RegExp[]) {
  return (_req: Request) => false;
}
