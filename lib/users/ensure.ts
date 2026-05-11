import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Ensure a `public.users` row exists for the given Clerk user id.
 *
 * Many tables (radio_episodes, study_rooms, blitz_matches, gauntlet_attempts,
 * flashcards, learning_fingerprints, ...) have foreign keys back to
 * users.clerk_id. If the row doesn't exist yet — typically because the user
 * landed directly on /radio without first visiting /dashboard — those
 * inserts fail with a foreign-key violation.
 *
 * This helper is idempotent: cheap select first, then insert only if missing.
 * Call it at the top of any route handler that writes a row referencing the
 * current user.
 */
export async function ensureUserRow(userId: string): Promise<void> {
  const supabase = await getServerSupabase();

  const { data: existing } = await supabase
    .from("users")
    .select("clerk_id")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (existing) return;

  const user = await currentUser().catch(() => null);
  await supabase.from("users").insert({
    clerk_id: userId,
    username: user?.username ?? user?.firstName ?? null,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    avatar_url: user?.imageUrl ?? null,
    last_active: new Date().toISOString(),
  });
}
