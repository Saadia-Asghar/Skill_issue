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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return useMemo(
    () => {
      // During prerender (e.g. /_not-found on Vercel), env may be unset.
      // Return a noop-ish placeholder so build doesn't crash.
      if (!supabaseUrl || !supabaseKey) {
        if (typeof window === "undefined") {
          return {} as SupabaseClient<Database>;
        }
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        );
      }
      return createClient<Database>(supabaseUrl, supabaseKey, {
        accessToken: async () => (session ? session.getToken() : null),
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    },
    [session, supabaseKey, supabaseUrl],
  );
}
