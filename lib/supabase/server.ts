import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Server-side Supabase client.
 *
 * IDEAL PRODUCTION SETUP:
 *   Forward the caller's Clerk session token as the Supabase access token.
 *   Supabase's third-party-auth integration with Clerk verifies the JWT, and
 *   RLS policies see the Clerk user id at `auth.jwt() ->> 'sub'`.
 *
 *   To enable this:
 *   1. Open https://dashboard.clerk.com/setup/supabase
 *      (or Supabase dashboard -> Authentication -> Sign In/Providers ->
 *       Third-Party Auth -> Add Provider -> Clerk)
 *   2. Connect this Clerk instance to the Supabase project.
 *   3. Set CLERK_SUPABASE_JWT_TRUSTED=1 in .env.local
 *   4. Drop the "demo: ... anon all" policies from the Supabase project
 *      (see migration `demo_mode_anon_permissive_policies`).
 *
 * CURRENT (DEMO) BEHAVIOR:
 *   We DO NOT forward the Clerk token, because Supabase has no JWKS
 *   provider for the Clerk issuer and would reject every authenticated
 *   request with `"No suitable key or wrong key type"`. Instead, requests
 *   land as the `anon` role, and the migration `demo_mode_anon_permissive_policies`
 *   grants `anon` full access to user-data tables. Per-user isolation is
 *   enforced at the API layer (every route filters by Clerk userId before
 *   touching Supabase).
 *
 *   THIS IS NOT SAFE FOR PUBLIC PRODUCTION. The publishable anon key is
 *   visible in the browser, so anyone can read/write any user's rows by
 *   hitting Supabase directly. Do the third-party-auth setup above before
 *   shipping to real users.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database>> {
  const trusted =
    process.env.CLERK_SUPABASE_JWT_TRUSTED === "1" ||
    process.env.CLERK_SUPABASE_JWT_TRUSTED === "true";

  if (trusted) {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        accessToken: async () => session.getToken(),
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  // Demo path: anon role + relaxed RLS (see migration).
  return getAnonServerSupabase();
}

/**
 * Anonymous server-side client (no Clerk token). Useful for reading public
 * reference tables like `subjects` and `personas` without an authenticated
 * session — for example on the marketing landing page.
 */
export function getAnonServerSupabase(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
