import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Server-side Supabase client that forwards the caller's Clerk session token
 * as the access token. Supabase's third-party auth integration with Clerk
 * verifies the JWT, and RLS policies see the Clerk user id at
 * `auth.jwt() ->> 'sub'`.
 *
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database>> {
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
