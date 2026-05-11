/**
 * Translate raw Supabase error messages into actionable, user-facing copy.
 *
 * The most common failure during local setup is the Clerk ↔ Supabase JWT
 * integration being inactive — Supabase has no JWKS provider for the issuer
 * embedded in the Clerk session token, so every authenticated query is
 * rejected with `"No suitable key or wrong key type"`. We surface a
 * pointer-to-the-fix instead of leaking the cryptic Postgres error.
 */
const CLERK_SUPABASE_NOT_CONFIGURED_MARKERS = [
  "no suitable key",
  "wrong key type",
  "jwks",
  "missing sub claim",
  "invalid jwt",
  "jwt expired",
];

export type HumanizedSupabaseError = {
  status: number;
  message: string;
  hint?: string;
};

export function humanizeSupabaseError(e: unknown): HumanizedSupabaseError {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (CLERK_SUPABASE_NOT_CONFIGURED_MARKERS.some((m) => lower.includes(m))) {
    return {
      status: 503,
      message:
        "Clerk ↔ Supabase JWT trust isn't configured yet. " +
        "This blocks every authenticated database write " +
        "(blitz match-making, study rooms, radio episodes, ranked gauntlet attempts).",
      hint:
        "Open https://dashboard.clerk.com/setup/supabase, paste your Supabase " +
        "project URL (https://fuvhzltjhfvnvohjxybe.supabase.co), and click Activate. " +
        "Then reload this page — no code change needed.",
    };
  }

  return { status: 500, message: raw || "Unknown server error" };
}
