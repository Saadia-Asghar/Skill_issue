"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import type {
  BlitzMatchRow,
  Database,
  GladiatorMatchRow,
  GlobalMessageRow,
  RoomMessageRow,
  StudyRoomRow,
} from "@/lib/supabase/types";

/**
 * Subscribe to Postgres-Changes for a single row of `blitz_matches`. Returns
 * the latest row state, refreshed live as the server advances the match.
 *
 * We deliberately key the channel on the row id so concurrent matches don't
 * cross-pollinate, and we tear down the subscription on unmount to avoid the
 * "ghost subscriptions" problem.
 */
export function useBlitzMatchSubscription(
  supabase: SupabaseClient<Database>,
  matchId: string | null,
  initial: BlitzMatchRow | null,
): BlitzMatchRow | null {
  const [row, setRow] = useState<BlitzMatchRow | null>(initial);

  useEffect(() => {
    if (!matchId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRow(initial);

    const channel = supabase
      .channel(`blitz-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blitz_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          if (payload.new) setRow(payload.new as BlitzMatchRow);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // matchId is the only dependency that should retrigger; `initial` is
    // intentionally captured at first mount (it's a snapshot) and `supabase`
    // is memoized via useSupabase().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return row;
}

/**
 * Watch the matchmaking queue for "you got matched" — implemented as a
 * subscription on inserts to `blitz_matches` where the user is a participant.
 * The queue table itself is mostly write-only from the client, so we listen
 * on the *output* of the queue (the new match row) instead of the queue.
 */
export function useBlitzMatchedListener(
  supabase: SupabaseClient<Database>,
  clerkId: string | null,
  onMatched: (matchId: string) => void,
) {
  useEffect(() => {
    if (!clerkId) return;
    const channel = supabase
      .channel(`blitz-lobby:${clerkId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blitz_matches",
          filter: `player_b=eq.${clerkId}`,
        },
        (payload) => {
          const m = payload.new as BlitzMatchRow;
          if (m.id) onMatched(m.id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blitz_matches",
          filter: `player_a=eq.${clerkId}`,
        },
        (payload) => {
          const m = payload.new as BlitzMatchRow;
          if (m.id) onMatched(m.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkId]);
}

/**
 * Subscribe to a Study Room row for live state changes (LOBBY -> STUDY -> QUIZ
 * -> FINISHED). Members are watched separately via {@link useRoomMembersSubscription}.
 */
export function useRoomSubscription(
  supabase: SupabaseClient<Database>,
  roomId: string | null,
  initial: StudyRoomRow | null,
): StudyRoomRow | null {
  const [row, setRow] = useState<StudyRoomRow | null>(initial);

  useEffect(() => {
    if (!roomId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRow(initial);
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) setRow(payload.new as StudyRoomRow);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return row;
}

type Member = Database["public"]["Tables"]["study_room_members"]["Row"];

/**
 * Subscribe to all member rows in a single Study Room. Returns a stable list
 * sorted by join time; the server is the source of truth for `correct_count`
 * and `current_q` so we don't shadow them client-side.
 */
export function useRoomMembersSubscription(
  supabase: SupabaseClient<Database>,
  roomId: string | null,
  initial: Member[],
): Member[] {
  const [members, setMembers] = useState<Member[]>(initial);
  const ref = useRef<Member[]>(initial);
  // Sync the ref to the latest members snapshot. The ref is read by event
  // handlers / effects in consumers that need the freshest list without
  // closing over stale state.
  useEffect(() => {
    ref.current = members;
  }, [members]);

  useEffect(() => {
    if (!roomId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(initial);
    const channel = supabase
      .channel(`room-members:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_room_members",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setMembers((prev) => {
            const next = [...prev];
            const incoming = (payload.new ?? payload.old) as Member;
            const idx = next.findIndex((m) => m.user_id === incoming.user_id);
            if (payload.eventType === "DELETE") {
              if (idx >= 0) next.splice(idx, 1);
            } else if (idx >= 0) {
              next[idx] = payload.new as Member;
            } else {
              next.push(payload.new as Member);
            }
            return next.sort(
              (a, b) =>
                new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
            );
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return members;
}

/**
 * A small ticking clock hook. Returns Date.now() refreshed every `intervalMs`.
 * Useful for live countdown timers without scattering setInterval everywhere.
 */
export function useTick(intervalMs: number = 250, enabled: boolean = true): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
  return tick;
}

/**
 * Teardown helper that cleans up an array of channels at unmount. Use from
 * effects that may open multiple channels conditionally.
 */
export function useChannelsCleanup(
  supabase: SupabaseClient<Database>,
  channels: RealtimeChannel[],
) {
  useEffect(() => {
    return () => {
      channels.forEach((c) => void supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Subscribe to new global chat inserts (append-only stream). */
export function useGlobalMessagesSubscription(
  supabase: SupabaseClient<Database>,
  onInsert: (row: GlobalMessageRow) => void,
) {
  useEffect(() => {
    const channel = supabase
      .channel("global-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_messages" },
        (payload) => {
          if (payload.new) onInsert(payload.new as GlobalMessageRow);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onInsert, supabase]);
}

/** Subscribe to inserts for one study room's chat feed. */
export function useRoomMessagesSubscription(
  supabase: SupabaseClient<Database>,
  roomId: string | null,
  onInsert: (row: RoomMessageRow) => void,
) {
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) onInsert(payload.new as RoomMessageRow);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onInsert, roomId, supabase]);
}

/** Live-sync one Gladiator match row for combat UI. */
export function useGladiatorMatch(
  supabase: SupabaseClient<Database>,
  matchId: string | null,
  initial: GladiatorMatchRow | null,
): GladiatorMatchRow | null {
  const [row, setRow] = useState<GladiatorMatchRow | null>(initial);

  useEffect(() => {
    if (!matchId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRow(initial);
    const channel = supabase
      .channel(`gladiator-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gladiator_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          if (payload.new) setRow(payload.new as GladiatorMatchRow);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return row;
}
