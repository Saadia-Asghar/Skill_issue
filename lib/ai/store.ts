import "server-only";

import type { GauntletQuestion } from "./gauntlet";
import type { PersonaSlug } from "./personas";

/**
 * In-memory Comprehension Gauntlet session store.
 *
 * Keeps the full questions (with `correct_index` and `gotcha`) server-side
 * so the client can never inspect the answer key. Client only ever sees
 * `{ id, q, choices }`.
 *
 * Two flavours of session:
 *   - Free-play (`/learn`): questions generated per user; no concept_id;
 *     no Daily Drop attribution; no Elo on submit.
 *   - Colosseum (`/colosseum/play`): questions are the canonical set baked
 *     into `daily_drops.questions` so every player faces the same exam;
 *     `conceptId` and `dropDate` are populated; submit goes through the
 *     colosseum scoring path.
 *
 * `gauntletStartedAt` is set when the session is created (i.e. the moment
 * questions are served). The server uses (now - startedAt) as the elapsed
 * time for the speed component of the performance score, so client-supplied
 * timings can never be trusted to inflate XP/Elo.
 *
 * NOTE: process-local — fine for `next dev` and a single-instance deploy.
 * For multi-instance production, swap this for Redis/Upstash with the same
 * interface. Sessions older than `TTL_MS` are evicted lazily on reads.
 */

type GauntletSession = {
  questions: GauntletQuestion[];
  text: string;
  personaSlug: PersonaSlug;
  createdAt: number;
  /** Wall-clock ms when questions were served. Anchor for elapsed time. */
  gauntletStartedAt: number;
  /** Submitted choices keyed by question index. Populated by /answer. */
  answers: Record<number, number>;
  /** Set on Colosseum sessions. Free-play sessions leave these null. */
  conceptId: string | null;
  dropDate: string | null;
};

const STORE = new Map<string, GauntletSession>();
const TTL_MS = 60 * 60 * 1000;

function gc() {
  const now = Date.now();
  for (const [id, session] of STORE) {
    if (now - session.createdAt > TTL_MS) STORE.delete(id);
  }
}

export type CreateSessionInput = {
  questions: GauntletQuestion[];
  text: string;
  personaSlug: PersonaSlug;
  conceptId?: string | null;
  dropDate?: string | null;
};

export function createSession(input: CreateSessionInput): string {
  gc();
  const id = crypto.randomUUID();
  const now = Date.now();
  STORE.set(id, {
    questions: input.questions,
    text: input.text,
    personaSlug: input.personaSlug,
    conceptId: input.conceptId ?? null,
    dropDate: input.dropDate ?? null,
    createdAt: now,
    gauntletStartedAt: now,
    answers: {},
  });
  return id;
}

export function getSession(id: string): GauntletSession | null {
  gc();
  return STORE.get(id) ?? null;
}

/**
 * Record the user's choice for a single question. Idempotent — submitting
 * the same questionId twice keeps the first answer (mirrors the frontend
 * UX that disables choices once one is picked).
 */
export function recordAnswer(
  id: string,
  questionId: number,
  choice: number,
): GauntletSession | null {
  const session = getSession(id);
  if (!session) return null;
  if (!(questionId in session.answers)) {
    session.answers[questionId] = choice;
  }
  return session;
}

/**
 * Server-measured elapsed seconds for the gauntlet portion of the run.
 * Floored to a non-negative integer.
 */
export function elapsedSeconds(session: GauntletSession, now = Date.now()): number {
  return Math.max(0, Math.floor((now - session.gauntletStartedAt) / 1000));
}
