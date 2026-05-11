"use client";

import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";

import type { Database } from "./types";

/**
 * Browser-side Supabase client bound to the current Clerk session. Calls
 * `session.getToken()` on every request so the JWT auto-refreshes as Clerk
 * rotates it. Returns `null` if the user is signed out (RLS treats requests
 * as anonymous).
 */
export function useSupabase(): SupabaseClient<Database> {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          accessToken: async () => (session ? session.getToken() : null),
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      ),
    [session],
  );
}
