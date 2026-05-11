/**
 * Wire-format constants shared by Realtime channels. Centralized so the
 * client and server agree on names without magic strings, and so any future
 * provider swap (Pusher / Ably / self-hosted Socket.io) can rename channels
 * in one place.
 */

/** Per-question answer window in the 1v1 Blitz sudden-death phase. */
export const BLITZ_QUESTION_SECONDS = 12;

/** Total study window before the blitz quiz starts. */
export const BLITZ_STUDY_SECONDS = 120;

/** Hard cap on the matchmaking wait. After this we offer "play vs AI" UX. */
export const BLITZ_QUEUE_TIMEOUT_SECONDS = 60;

/** Number of questions generated per blitz match. First-to-3 wins. */
export const BLITZ_QUESTION_POOL = 7;

/** Blitz Elo K-factor — lower than Colosseum since matches are higher variance. */
export const BLITZ_ELO_K = 24;

/** Default study-room timer (seconds). Host can change later. */
export const ROOM_DEFAULT_STUDY_SECONDS = 180;

/** Number of canonical questions in a study-room quiz. */
export const ROOM_QUESTION_COUNT = 5;

/** Pass threshold (correct-answer count) to "win" a study room run. */
export const ROOM_PASS_THRESHOLD = 3;

/** Realtime channel naming. */
export const blitzChannel = (matchId: string) => `blitz:${matchId}`;
export const blitzLobbyChannel = (clerkId: string) => `blitz-lobby:${clerkId}`;
export const roomChannel = (roomId: string) => `room:${roomId}`;
