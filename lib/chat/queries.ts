import "server-only";

import { getAnonServerSupabase, getServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type ChatMessageKind = "text" | "run_share" | "system";

export type GlobalChatMessage = {
  id: number;
  user_id: string | null;
  persona_slug: string | null;
  kind: ChatMessageKind;
  content: string;
  payload: Json;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

export type RoomChatMessage = {
  id: number;
  room_id: string;
  user_id: string | null;
  kind: ChatMessageKind;
  content: string;
  payload: Json;
  created_at: string;
};

export async function fetchRecentGlobalMessages(
  limit = 100,
): Promise<GlobalChatMessage[]> {
  const supabase = getAnonServerSupabase();
  const { data, error } = await supabase
    .from("global_messages")
    .select("id,user_id,persona_slug,kind,content,payload,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 300)));
  if (error || !data) return [];

  const userIds = Array.from(
    new Set(
      data
        .map((m) => m.user_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  let profiles = new Map<string, { username: string | null; avatar_url: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("clerk_id,username,avatar_url")
      .in("clerk_id", userIds);
    profiles = new Map(
      (users ?? []).map((u) => [
        u.clerk_id,
        { username: u.username, avatar_url: u.avatar_url },
      ]),
    );
  }

  return data
    .map((m) => ({
      ...m,
      kind: m.kind as ChatMessageKind,
      username: m.user_id ? (profiles.get(m.user_id)?.username ?? null) : null,
      avatar_url: m.user_id ? (profiles.get(m.user_id)?.avatar_url ?? null) : null,
    }))
    .reverse();
}

export async function insertGlobalMessage(opts: {
  userId: string;
  content: string;
  kind?: ChatMessageKind;
  payload?: Json;
  personaSlug?: string | null;
}): Promise<void> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("insert_global_message", {
    p_user_id: opts.userId,
    p_content: opts.content,
    p_kind: opts.kind ?? "text",
    p_payload: (opts.payload ?? {}) as Json,
    p_persona_slug: opts.personaSlug ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function insertSystemGlobalMessage(opts: {
  content: string;
  personaSlug?: string | null;
  payload?: Json;
}): Promise<void> {
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("global_messages")
    .insert({
      user_id: null,
      persona_slug: opts.personaSlug ?? null,
      kind: "system",
      content: opts.content,
      payload: (opts.payload ?? {}) as Json,
    });
  if (error) throw new Error(error.message);
}

export async function fetchRecentRoomMessages(
  roomId: string,
  limit = 100,
): Promise<RoomChatMessage[]> {
  const supabase = getAnonServerSupabase();
  const { data, error } = await supabase
    .from("room_messages")
    .select("id,room_id,user_id,kind,content,payload,created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 300)));
  if (error || !data) return [];
  return data.map((m) => ({ ...m, kind: m.kind as ChatMessageKind })).reverse();
}

export async function insertRoomMessage(opts: {
  roomId: string;
  userId: string;
  content: string;
  kind?: ChatMessageKind;
  payload?: Json;
}): Promise<void> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("insert_room_message", {
    p_room_id: opts.roomId,
    p_user_id: opts.userId,
    p_content: opts.content,
    p_kind: opts.kind ?? "text",
    p_payload: opts.payload ?? {},
  });
  if (error) throw new Error(error.message);
}
