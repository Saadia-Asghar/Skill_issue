import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { rankForXp } from "@/lib/rank";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/users/sync
 *
 * Idempotent: ensures a `public.users` row exists for the current Clerk user,
 * keeping the cached username/email/avatar in sync with Clerk on every login.
 * Called from the dashboard server component on first render.
 *
 * RLS check: the row's `clerk_id` must equal `auth.jwt() ->> 'sub'`. The
 * Supabase client below forwards the user's Clerk session token, so the
 * insert/update are evaluated as that user (no service_role needed).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await currentUser();
  const supabase = await getServerSupabase();

  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("clerk_id, xp, rank")
    .eq("clerk_id", userId)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const payload = {
    clerk_id: userId,
    username: user?.username ?? user?.firstName ?? null,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    avatar_url: user?.imageUrl ?? null,
    last_active: new Date().toISOString(),
  };

  if (!existing) {
    const { data, error } = await supabase
      .from("users")
      .insert(payload)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ user: data, created: true });
  }

  // Recompute rank in case XP thresholds shifted while the user was away.
  const { data, error } = await supabase
    .from("users")
    .update({
      ...payload,
      rank: rankForXp(existing.xp),
    })
    .eq("clerk_id", userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ user: data, created: false });
}
