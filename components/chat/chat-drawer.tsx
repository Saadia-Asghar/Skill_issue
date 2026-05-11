"use client";

import { useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSupabase } from "@/lib/supabase/browser";

type ChatMessage = {
  id: number | string;
  user_id: string | null;
  persona_slug: string | null;
  kind: "text" | "run_share" | "system";
  content: string;
  payload: unknown;
  created_at: string;
  username?: string | null;
  avatar_url?: string | null;
  optimistic?: boolean;
};

function isOptimisticMatch(real: ChatMessage, optimistic: ChatMessage): boolean {
  if (!optimistic.optimistic) return false;
  if (!real.user_id || !optimistic.user_id) return false;
  if (real.user_id !== optimistic.user_id) return false;
  if (real.kind !== optimistic.kind) return false;
  if (real.content !== optimistic.content) return false;
  const a = new Date(real.created_at).getTime();
  const b = new Date(optimistic.created_at).getTime();
  return Math.abs(a - b) <= 60_000;
}

export function ChatDrawer() {
  const { user } = useUser();
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/chat/global?limit=120", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({ messages: [] }));
      if (!cancelled) setMessages((json.messages ?? []) as ChatMessage[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_messages" },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const optimisticIdx = prev.findIndex((m) =>
              isOptimisticMatch(row, m),
            );
            if (optimisticIdx >= 0) {
              const next = [...prev];
              next[optimisticIdx] = row;
              return next;
            }
            return [...prev, row];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const canSend = text.trim().length > 0 && !sending;
  const myId = user?.id ?? null;
  const title = useMemo(() => (open ? "Close Chat" : "Open Chat"), [open]);

  const send = async () => {
    const content = text.trim();
    if (!content || !myId || sending) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      user_id: myId,
      persona_slug: null,
      kind: "text",
      content,
      payload: {},
      created_at: new Date().toISOString(),
      username: user?.username ?? user?.firstName ?? "You",
      avatar_url: user?.imageUrl ?? null,
      optimistic: true,
    };
    setText("");
    setSending(true);
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("post failed");
    } catch {
      // Keep optimistic bubble but mark as failed-ish via suffix.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, content: `${m.content} (send failed)`, optimistic: false }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={title}
          title={title}
          className="fixed bottom-5 right-4 z-50 rounded-2xl border-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--accent-2)",
            color: "var(--accent-2)",
            boxShadow: "0 5px 0 0 var(--accent-2)",
          }}
        >
          Global Chat
        </button>
      )}

      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : 420 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        className="fixed bottom-0 right-0 top-[56px] z-40 w-full max-w-[420px] border-l-2"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--surface) 85%, #020617), #09051a)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex h-full flex-col">
          <div
            className="border-b-2 px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.35em]"
                  style={{ color: "var(--gold)" }}
                >
                  ◉ Global Lobby
                </p>
                <p className="mt-1 text-xs text-muted">
                  live arena chat across all pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted)",
                  background: "var(--surface)",
                }}
              >
                Close
              </button>
            </div>
          </div>

          <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m) => {
              const mine = myId && m.user_id === myId;
              const isSystem = m.kind === "system";
              return (
                <div
                  key={m.id}
                  className="rounded-xl border-2 px-3 py-2 text-sm"
                  style={{
                    background: isSystem
                      ? "color-mix(in srgb, var(--accent-2) 18%, var(--surface))"
                      : mine
                        ? "color-mix(in srgb, var(--lime) 14%, var(--surface))"
                        : "var(--surface)",
                    borderColor: isSystem
                      ? "var(--accent-2)"
                      : mine
                        ? "var(--lime)"
                        : "var(--border)",
                    opacity: m.optimistic ? 0.82 : 1,
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                      {isSystem
                        ? (m.persona_slug ?? "arena-bot").replaceAll("_", " ")
                        : (m.username ??
                          (m.user_id ? `${m.user_id.slice(0, 6)}…` : "anon"))}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              );
            })}
          </div>

          <div
            className="border-t-2 p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={1200}
                placeholder="say something to the lobby..."
                className="w-full rounded-xl border-2 px-3 py-2 text-sm focus:outline-none"
                style={{
                  background: "var(--surface)",
                  borderColor: "rgba(0,0,0,0.35)",
                  boxShadow: "0 4px 0 0 var(--border)",
                }}
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void send()}
                className="rounded-xl border-2 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-50"
                style={{
                  background: "var(--lime)",
                  color: "#092000",
                  borderColor: "rgba(0,0,0,0.35)",
                  boxShadow: "0 4px 0 0 #3d7a00",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
