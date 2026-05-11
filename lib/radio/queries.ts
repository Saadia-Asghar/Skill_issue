import "server-only";

import {
  getAnonServerSupabase,
  getServerSupabase,
} from "@/lib/supabase/server";
import type {
  Json,
  RadioEpisodeRow,
  RadioStatus,
} from "@/lib/supabase/types";

const RADIO_BUCKET = "radio";

/** Insert a `pending` episode and return its id. Caller drives status updates. */
export async function createEpisode(opts: {
  userId: string;
  title: string;
  sourceText: string;
}): Promise<RadioEpisodeRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("radio_episodes")
    .insert({
      user_id: opts.userId,
      title: opts.title.slice(0, 120),
      source_text: opts.sourceText.slice(0, 12000),
      status: "pending" as RadioStatus,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create radio episode: ${error?.message ?? "unknown"}`);
  }
  return data;
}

/** Patch arbitrary status / metadata onto an episode (server-side). */
export async function updateEpisode(
  id: string,
  patch: Partial<{
    status: RadioStatus;
    script: Json;
    audio_url: string | null;
    duration_seconds: number;
    word_count: number;
    error_message: string | null;
    title: string;
  }>,
) {
  const supabase = getAnonServerSupabase();
  const { error } = await supabase
    .from("radio_episodes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[radio] update failed", id, error);
  }
}

/** Mark an episode failed with a user-safe message. */
export async function failEpisode(id: string, message: string) {
  await updateEpisode(id, {
    status: "failed",
    error_message: message.slice(0, 500),
  });
}

/** Fetch a single episode for the polling endpoint / detail page. */
export async function fetchEpisode(id: string): Promise<RadioEpisodeRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("radio_episodes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** All episodes for the signed-in user, newest first. */
export async function fetchMyEpisodes(userId: string): Promise<RadioEpisodeRow[]> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("radio_episodes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Upload a generated mp3 to the `radio` storage bucket and return the
 * publicly-readable URL. Files are namespaced by user id so RLS policies
 * (write-own) do their job.
 */
export async function uploadEpisodeAudio(opts: {
  userId: string;
  episodeId: string;
  bytes: Uint8Array;
}): Promise<string> {
  const supabase = await getServerSupabase();
  const path = `${opts.userId}/${opts.episodeId}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from(RADIO_BUCKET)
    .upload(path, opts.bytes, {
      contentType: "audio/mpeg",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Failed to upload episode audio: ${uploadError.message}`);
  }
  const { data } = supabase.storage.from(RADIO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Resolve the user's top N personas by aggregate fingerprint weight across
 * all subjects. Falls back to a sensible default trio when no fingerprints
 * exist yet (new accounts) so Radio still works on day one.
 */
export async function fetchTopPersonas(
  userId: string,
  limit: number = 3,
): Promise<string[]> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("learning_fingerprints")
    .select("weight, persona:personas(slug)")
    .eq("user_id", userId)
    .order("weight", { ascending: false })
    .limit(50);

  const totals = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const slug = (row.persona as { slug?: string } | null)?.slug;
    if (!slug) return;
    totals.set(slug, (totals.get(slug) ?? 0) + (row.weight ?? 0));
  });

  if (totals.size === 0) {
    // Sensible defaults — a creator + a teacher + a hype voice.
    return ["mr_viral", "professor", "twitch_streamer"].slice(0, limit);
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug]) => slug);
}
