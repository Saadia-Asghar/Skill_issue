import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import type {
  GladiatorMatchRow,
  GladiatorProfileRow,
  Json,
  StoreItemRow,
  UserInventoryRow,
} from "@/lib/supabase/types";

export const GLADIATOR_BOT_ID = "BOT_ID";

export async function ensureGladiatorBot(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.from("users").upsert(
    {
      clerk_id: GLADIATOR_BOT_ID,
      username: "Ghost of the Ludus",
      email: null,
      avatar_url: null,
    },
    { onConflict: "clerk_id" },
  );
  await supabase.from("gladiator_profiles").upsert(
    {
      user_id: GLADIATOR_BOT_ID,
      glory_points: 0,
      total_wins: 0,
      worldwide_score: 1200,
    },
    { onConflict: "user_id" },
  );
}

export async function ensureGladiatorProfile(
  userId: string,
): Promise<GladiatorProfileRow> {
  const supabase = await getServerSupabase();
  const { data: existing } = await supabase
    .from("gladiator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("gladiator_profiles")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create profile");
  return data;
}

export async function fetchGladiatorMatch(
  matchId: string,
): Promise<GladiatorMatchRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("gladiator_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  return data ?? null;
}

export async function findActiveGladiatorMatchForUser(
  userId: string,
): Promise<GladiatorMatchRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("gladiator_matches")
    .select("*")
    .eq("status", "IN_PROGRESS")
    .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function queueOrMatch(opts: {
  userId: string;
  openingQuestion: Json;
  forceBot: boolean;
  subjectId: string;
  conceptId: string | null;
}): Promise<string> {
  const supabase = await getServerSupabase();
  if (opts.forceBot) {
    const { data, error } = await supabase.rpc("dequeue_gladiator_partner", {
      p_user_id: opts.userId,
      p_bot_id: GLADIATOR_BOT_ID,
      p_current_question: opts.openingQuestion,
      p_force_bot: true,
      p_subject_id: opts.subjectId,
      p_concept_id: opts.conceptId ?? undefined,
    });
    if (error || !data) throw new Error(error?.message ?? "Failed to create bot match");
    return data;
  }

  const { data: queued } = await supabase
    .from("gladiator_queue")
    .select("*")
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (
    !queued ||
    queued.subject_id !== opts.subjectId ||
    queued.concept_id !== opts.conceptId
  ) {
    await supabase.from("gladiator_queue").upsert({
      user_id: opts.userId,
      subject_id: opts.subjectId,
      concept_id: opts.conceptId,
      joined_at: new Date().toISOString(),
    });
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const { data, error } = await supabase.rpc("dequeue_gladiator_partner", {
      p_user_id: opts.userId,
      p_bot_id: GLADIATOR_BOT_ID,
      p_current_question: opts.openingQuestion,
      p_force_bot: false,
      p_subject_id: opts.subjectId,
      p_concept_id: opts.conceptId ?? undefined,
    });
    if (!error && data) return data;
    await sleep(900);
  }

  const { data, error } = await supabase.rpc("dequeue_gladiator_partner", {
    p_user_id: opts.userId,
    p_bot_id: GLADIATOR_BOT_ID,
    p_current_question: opts.openingQuestion,
    p_force_bot: true,
    p_subject_id: opts.subjectId,
    p_concept_id: opts.conceptId ?? undefined,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to create fallback bot match");
  return data;
}

export async function fetchGladiatorStudyOptions(): Promise<{
  subjects: Array<{ id: string; name: string }>;
  concepts: Array<{ id: string; subject_id: string | null; title: string }>;
}> {
  const supabase = await getServerSupabase();
  const [{ data: subjects }, { data: concepts }] = await Promise.all([
    supabase.from("subjects").select("id,name").order("name"),
    supabase.from("concepts").select("id,subject_id,title").order("title").limit(400),
  ]);
  return {
    subjects: (subjects ?? []) as Array<{ id: string; name: string }>,
    concepts: (concepts ?? []) as Array<{
      id: string;
      subject_id: string | null;
      title: string;
    }>,
  };
}

export async function submitGladiatorAnswer(opts: {
  matchId: string;
  actorId: string;
  choice: number;
  answeredAt?: string;
}): Promise<GladiatorMatchRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("submit_gladiator_answer", {
    p_match_id: opts.matchId,
    p_actor_id: opts.actorId,
    p_choice: opts.choice,
    p_answered_at: opts.answeredAt,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to submit answer");
  return data;
}

export async function resolveGladiatorTimeout(
  matchId: string,
): Promise<GladiatorMatchRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("resolve_gladiator_timeout", {
    p_match_id: matchId,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to resolve timeout");
  return data;
}

export async function advanceGladiatorRound(opts: {
  matchId: string;
  nextQuestion: Json;
}): Promise<GladiatorMatchRow> {
  const supabase = await getServerSupabase();
  const { data: current, error: currentErr } = await supabase
    .from("gladiator_matches")
    .select("round_number")
    .eq("id", opts.matchId)
    .single();
  if (currentErr || !current) {
    throw new Error(currentErr?.message ?? "Failed to load current round");
  }

  const { data: bumped, error: bumpErr } = await supabase
    .from("gladiator_matches")
    .update({
      current_question: opts.nextQuestion,
      phase: "QUESTION",
      round_number: current.round_number + 1,
      round_started_at: new Date().toISOString(),
      p1_round_choice: null,
      p2_round_choice: null,
      p1_answered_at: null,
      p2_answered_at: null,
    })
    .eq("id", opts.matchId)
    .eq("status", "IN_PROGRESS")
    .select("*")
    .single();
  if (bumpErr || !bumped) throw new Error(bumpErr?.message ?? "Failed to bump round");
  return bumped;
}

export async function fetchAgoraData(userId: string): Promise<{
  profile: GladiatorProfileRow;
  leaderboard: GladiatorProfileRow[];
  storeItems: StoreItemRow[];
  inventory: UserInventoryRow[];
}> {
  const supabase = await getServerSupabase();
  const profile = await ensureGladiatorProfile(userId);
  const [{ data: leaderboard }, { data: storeItems }, { data: inventory }] =
    await Promise.all([
      supabase
        .from("gladiator_profiles")
        .select("*")
        .order("worldwide_score", { ascending: false })
        .order("total_wins", { ascending: false })
        .limit(25),
      supabase.from("store_items").select("*").eq("active", true).order("price"),
      supabase.from("user_inventory").select("*").eq("user_id", userId),
    ]);

  return {
    profile,
    leaderboard: leaderboard ?? [],
    storeItems: storeItems ?? [],
    inventory: inventory ?? [],
  };
}

export async function purchaseItem(
  userId: string,
  itemId: string,
): Promise<UserInventoryRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("purchase_store_item", {
    p_user_id: userId,
    p_item_id: itemId,
  });
  if (error || !data) throw new Error(error?.message ?? "Purchase failed");
  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
