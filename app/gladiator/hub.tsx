"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ArcadeButton, ArcadeLink } from "@/components/game/arcade-button";
import { GameCard } from "@/components/game/game-card";
import { ArenaMusicToggle } from "@/components/gladiator/arena-music";

type Profile = {
  user_id: string;
  glory_points: number;
  total_wins: number;
  worldwide_score: number;
};

type StoreItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  price: number;
};

type InventoryRow = { item_id: string; quantity: number };
type Subject = { id: string; name: string };
type Concept = { id: string; subject_id: string | null; title: string };

export function GladiatorHub({
  userId,
  activeMatchId,
}: {
  userId: string;
  activeMatchId: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseBusy, setPurchaseBusy] = useState<string | null>(null);
  const [lockedItem, setLockedItem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedConcept, setSelectedConcept] = useState<string>("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/gladiator/store", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok) {
        setLoadError(getErrorMessage(json) ?? "Could not load Gladiator store right now.");
      } else {
        const parsed = normalizeStorePayload(json);
        setProfile(parsed.profile);
        setLeaderboard(parsed.leaderboard);
        setStoreItems(parsed.storeItems);
        setInventory(parsed.inventory);
      }
    } catch {
      setLoadError("Could not load Gladiator store right now.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const loadOptions = async () => {
      const res = await fetch("/api/gladiator/options", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok || !isObject(json)) return;
      const nextSubjects = Array.isArray(json.subjects) ? (json.subjects as Subject[]) : [];
      const nextConcepts = Array.isArray(json.concepts) ? (json.concepts as Concept[]) : [];
      setSubjects(nextSubjects);
      setConcepts(nextConcepts);
      if (nextSubjects.length > 0 && !selectedSubject) {
        setSelectedSubject(nextSubjects[0]!.id);
      }
    };
    void loadOptions();
  }, [selectedSubject]);

  const findMatch = useCallback(
    async (solo: boolean) => {
      setQueueError(null);
      const res = await fetch("/api/gladiator/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          solo,
          subjectId: selectedSubject,
          conceptId: selectedConcept || undefined,
        }),
      });
      const json = await safeJson(res);
      const matchId = getStringField(json, "matchId");
      if (res.ok && matchId) {
        router.push(`/gladiator/${matchId}`);
        return;
      }
      setQueueError(getErrorMessage(json) ?? "Could not start matchmaking.");
    },
    [router, selectedConcept, selectedSubject],
  );

  const filteredConcepts = useMemo(
    () => concepts.filter((c) => c.subject_id === selectedSubject),
    [concepts, selectedSubject],
  );

  const inventoryMap = useMemo(
    () =>
      inventory.reduce<Record<string, number>>((acc, row) => {
        acc[row.item_id] = row.quantity;
        return acc;
      }, {}),
    [inventory],
  );

  const onPurchase = useCallback(
    async (item: StoreItem) => {
      if (!profile) return;
      if (profile.glory_points < item.price) {
        setLockedItem(item.id);
        window.setTimeout(() => setLockedItem((id) => (id === item.id ? null : id)), 450);
        return;
      }

      setPurchaseBusy(item.id);
      setProfile((prev) =>
        prev ? { ...prev, glory_points: prev.glory_points - item.price } : prev,
      );
      setInventory((prev) => {
        const i = prev.find((row) => row.item_id === item.id);
        if (i) return prev.map((row) => (row.item_id === item.id ? { ...row, quantity: row.quantity + 1 } : row));
        return [...prev, { item_id: item.id, quantity: 1 }];
      });

      const res = await fetch("/api/gladiator/store/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) {
        await load();
        setLockedItem(item.id);
        window.setTimeout(() => setLockedItem((id) => (id === item.id ? null : id)), 450);
      }
      setPurchaseBusy(null);
    },
    [load, profile],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--gold)]">
            gladiator arena
          </p>
          <h1 className="text-4xl font-black">The Agora</h1>
        </div>
        <div className="flex items-center gap-3">
          <ArenaMusicToggle />
          <div className="arcade-card px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Glory Points</p>
            <p className="text-2xl font-black text-[var(--coin-gold)]">
              {profile?.glory_points ?? 0}
            </p>
          </div>
        </div>
      </div>

      {activeMatchId ? (
        <GameCard skin="magenta" className="mt-5 p-4">
          <p className="text-sm font-bold">You already have a live duel.</p>
          <ArcadeLink href={`/gladiator/${activeMatchId}`} skin="gold" size="sm" className="mt-2">
            ▶ Resume Match
          </ArcadeLink>
        </GameCard>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <GameCard className="p-6">
          <h2 className="text-2xl font-black">Enter Arena</h2>
          <p className="mt-2 text-sm text-muted">
            Human matchmaking scans for 10 seconds. If no rival appears, the Ghost
            of the Ludus materializes automatically.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-bold">
              Subject to study
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-heavy)] bg-[var(--surface-2)] px-3 py-2"
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                  setSelectedConcept("");
                }}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Concept (optional)
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-heavy)] bg-[var(--surface-2)] px-3 py-2"
                value={selectedConcept}
                onChange={(e) => setSelectedConcept(e.target.value)}
              >
                <option value="">Any concept in subject</option>
                {filteredConcepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ArcadeButton
              skin="magenta"
              disabled={!selectedSubject}
              onClick={() => void findMatch(false)}
            >
              Queue PvP
            </ArcadeButton>
            <ArcadeButton
              skin="ghost"
              disabled={!selectedSubject}
              onClick={() => void findMatch(true)}
            >
              Train in the Ludus
            </ArcadeButton>
          </div>
          {queueError ? (
            <p className="mt-3 text-sm font-bold text-[var(--mario-red)]">{queueError}</p>
          ) : null}
        </GameCard>

        <GameCard className="p-6">
          <h2 className="text-2xl font-black">Worldwide Leaderboard</h2>
          <div className="mt-4 space-y-2">
            {isLoading ? <p className="text-sm text-muted">Loading rankings...</p> : null}
            {leaderboard.map((row, idx) => (
              <div key={row.user_id} className="arcade-card flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-black">{idx + 1}</span>
                  <span className="text-sm">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "⚔"}
                  </span>
                  <span className="text-sm font-bold">
                    {row.user_id === userId ? "You" : row.user_id.slice(0, 8)}
                  </span>
                </div>
                <span className="text-sm font-black">{row.worldwide_score}</span>
              </div>
            ))}
          </div>
        </GameCard>
      </div>

      <GameCard className="mt-6 p-6">
        <h2 className="text-2xl font-black">Storefront</h2>
        {loadError ? (
          <p className="mt-2 text-sm font-bold text-[var(--mario-red)]">
            {loadError}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {storeItems.map((item) => {
            const isLocked = lockedItem === item.id;
            return (
              <motion.div
                key={item.id}
                className="arcade-card p-4"
                animate={isLocked ? { x: [-6, 6, -3, 3, 0] } : { x: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-black">
                      {item.icon ? `${item.icon} ` : ""}{item.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">{item.description}</p>
                  </div>
                  <span className="text-sm font-black text-[var(--coin-gold)]">
                    {item.price}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Owned: {inventoryMap[item.id] ?? 0}
                </p>
                <ArcadeButton
                  className="mt-3"
                  size="sm"
                  skin="gold"
                  disabled={purchaseBusy === item.id}
                  onClick={() => void onPurchase(item)}
                >
                  {purchaseBusy === item.id ? "Purchasing..." : "Purchase"}
                </ArcadeButton>
              </motion.div>
            );
          })}
        </div>
      </GameCard>
    </div>
  );
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(payload: unknown): string | null {
  if (!isObject(payload)) return null;
  const maybeError = payload.error;
  return typeof maybeError === "string" ? maybeError : null;
}

function getStringField(payload: unknown, key: string): string | null {
  if (!isObject(payload)) return null;
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function normalizeStorePayload(payload: unknown): {
  profile: Profile | null;
  leaderboard: Profile[];
  storeItems: StoreItem[];
  inventory: InventoryRow[];
} {
  if (!payload || typeof payload !== "object") {
    return { profile: null, leaderboard: [], storeItems: [], inventory: [] };
  }
  const data = payload as Record<string, unknown>;
  return {
    profile: (isObject(data.profile) ? (data.profile as Profile) : null) ?? null,
    leaderboard: Array.isArray(data.leaderboard) ? (data.leaderboard as Profile[]) : [],
    storeItems: Array.isArray(data.storeItems) ? (data.storeItems as StoreItem[]) : [],
    inventory: Array.isArray(data.inventory) ? (data.inventory as InventoryRow[]) : [],
  };
}
