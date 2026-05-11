# Professor Decompose V3 — The Cognitive Arena

The LeetCode of Learning. A Next.js app that maps which pedagogical style ("influencer persona") actually makes information stick for each user, validates retention through a Comprehension Gauntlet, and ranks learners on a global Elo leaderboard.

This commit lays down the foundation: project scaffold, auth (Clerk), the Fingerprint DB (Supabase), and analytics (PostHog). The arena features (Daily Drop, 1v1 Blitz, persona explanations, gauntlet) build on top of this.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Clerk** for authentication, integrated with Supabase as a third-party auth provider (Supabase verifies Clerk-issued JWTs natively — no JWT templates, no shared secrets)
- **Supabase** Postgres for the Fingerprint DB
- **PostHog** for product analytics with autocapture + identified pageviews
- **Vercel AI SDK** + **Anthropic Claude** (Haiku 4.5 for streamed explanations, Sonnet 4.5 for the structured Comprehension Gauntlet)
- **Supabase Realtime** (Postgres-Changes channels) for 1v1 Blitz, Study Rooms, and Radio status — no Pusher, no socket server
- **ElevenLabs** Turbo v2.5 TTS for Professor Radio (graceful-degrades to script-only when unconfigured)
- **Bun** as the package manager

## Database schema

| Table                   | Purpose                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subjects`              | Reference list of academic subjects (CS, Physics, Econ, ...)                                                                                       |
| `personas`              | The influencer roster (Mr. Viral, Tech Reviewer, Twitch Streamer, Drill Sergeant, ...)                                                             |
| `users`                 | App-side profile keyed by `clerk_id`. Stores `xp`, `rank` (Freshman -> Dean), `elo`, `current_streak`, `last_streak_date`                          |
| `learning_fingerprints` | `(user, subject) -> persona` mapping with running EMA `weight` — the cognitive map                                                                 |
| `concepts`              | Pool of explainable concepts the Daily Drop selects from (15 seeded across 5 subjects, difficulty 1-5)                                             |
| `daily_drops`           | One row per UTC date, with the **canonical** 3-question gauntlet baked in so every player faces the same exam — LeetCode-fair leaderboard         |
| `gauntlet_attempts`     | Every completed run. Unique partial index on `(user_id, drop_date) where is_ranked` ensures only one ranked attempt per drop                       |
| `blitz_queue`           | Matchmaking waiting room — one row per user actively looking. Atomically drained by `dequeue_blitz_partner` w/ `SELECT FOR UPDATE SKIP LOCKED`     |
| `blitz_matches`         | A single 1v1 match: both players, both personas, the concept, the question pool, per-question state machine (`STUDY → BLITZ → FINISHED`)          |
| `blitz_answers`         | Append-only log of every answer submitted in a blitz match. Server records `clock_timestamp()` so first-correct ties are broken authoritatively    |
| `study_rooms`           | A 6-digit-coded room hosted by one user. Tracks state (`LOBBY → STUDY → QUIZ → FINISHED`), source text, generated question pool                    |
| `study_room_members`    | Per-member quiz progress (`current_q`, `correct_count`, `finish_position`) inside a study room                                                     |
| `flashcards`            | Spaced-repetition cards generated in a persona's voice. Leitner box (`1..5`) + `next_review_at` drive the review queue                             |
| `radio_episodes`        | Generated podcast episodes — script JSON + storage URL + status enum (`pending → scripting → voicing → ready` / `failed`)                          |

Every table has RLS enabled. User-owned rows are scoped to `auth.jwt() ->> 'sub'` (the Clerk user id forwarded as the access token).

The `radio` Supabase Storage bucket is public-read with owner-only writes via RLS.

Two Postgres helpers back the Colosseum:

- `compute_rank(xp)` mirrors [`lib/rank.ts`](lib/rank.ts) so rank can be recomputed atomically with the XP write.
- `record_gauntlet_attempt(...)` is the single write path for a completed run. It re-checks the JWT `sub` matches the user, locks the user row, inserts the attempt, updates `elo`/`xp`/`rank`/`current_streak`/`last_streak_date`, and returns the inserted row — all in one transaction so a double-submit race can't double-credit.

Four more Postgres helpers back the realtime arena:

- `dequeue_blitz_partner(p_user, p_persona)` atomically claims a waiting opponent from `blitz_queue` (`SKIP LOCKED`). Returns the partner row or NULL — caller decides whether to enqueue itself.
- `record_blitz_answer(p_match, p_user, p_q_index, p_choice)` validates state, stamps `clock_timestamp()`, and appends to `blitz_answers`. Idempotent per `(match, user, q_index)` so duplicate clicks are safe.
- `advance_blitz_question(p_match)` is the authoritative tick: tallies whoever answered correctly first, increments scores, transitions to the next question (or `FINISHED`), and on finish atomically transfers Elo (K=24, FIDE-style).
- `start_blitz_phase(p_match, p_phase)` transitions `STUDY → BLITZ` (and stamps `q_started_at`). Idempotent so both clients can race the timeout.

The `rank_tier` enum is `Freshman, Sophomore, Junior, Senior, Graduate, PhD, Dean`. XP thresholds live in [`lib/rank.ts`](lib/rank.ts).

## First-time setup

You need three accounts: a Supabase project (already provisioned via the Supabase MCP — `professor-decompose-v3`), a Clerk app, and a PostHog project.

### 1. Install dependencies

```bash
bun install
```

### 2. Create a Clerk application

1. Visit https://dashboard.clerk.com and create a new application (Email + Google OAuth recommended).
2. Copy the publishable key and secret key from **API keys**.
3. Visit https://dashboard.clerk.com/setup/supabase and connect this Clerk instance to the Supabase project. This handles the third-party auth wiring on both sides automatically.

### 3. Create a PostHog project

1. Visit https://us.posthog.com and create a project.
2. Copy the project API key from **Project settings**.

### 4. Fill in `.env.local`

The Supabase URL and publishable key are already filled in. Replace the Clerk, PostHog, and Anthropic placeholders:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
ANTHROPIC_API_KEY=sk-ant-...

# Optional — Professor Radio. If missing, scripts still generate but
# audio synthesis is skipped and the player shows a degraded notice.
ELEVENLABS_API_KEY=...
ELEVENLABS_MODEL=eleven_turbo_v2_5

# Optional — override per-persona voices with a custom-cloned ElevenLabs
# voice. Falls back to the public-library voice ids in lib/ai/personas.ts.
ELEVENLABS_VOICE_MR_VIRAL=...
ELEVENLABS_VOICE_TECH_REVIEWER=...
ELEVENLABS_VOICE_TWITCH_STREAMER=...
ELEVENLABS_VOICE_DRILL_SERGEANT=...
ELEVENLABS_VOICE_GEN_Z=...
ELEVENLABS_VOICE_PROFESSOR=...
```

> Get an Anthropic key at https://console.anthropic.com/settings/keys. Without it the `/learn` page loads but the explain/gauntlet endpoints return `503`.
>
> Get an ElevenLabs key at https://elevenlabs.io/app/settings/api-keys. Without it `/radio` still works in script-only mode (no audio).

### 5. Run

```bash
bun dev
```

Visit http://localhost:3000 — you should land on the marketing page with the six seeded personas. Sign up with Clerk, then visit `/dashboard` to see your profile being created in `public.users` automatically.

## Where things live

```
app/
  layout.tsx                       # ClerkProvider + PostHogProvider + Nav
  page.tsx                         # Landing (lists seeded personas)
  globals.css                      # Arena dark theme tokens
  sign-in/, sign-up/               # Clerk-hosted auth
  dashboard/                       # Authed profile page: stats trio, Daily Drop card, Dean's List
  learn/                           # Free-play Synthesis Engine + Comprehension Gauntlet (XP only)
  colosseum/                       # Daily Drop lobby with countdown + your stats + top-10 preview
  colosseum/play/                  # Persona pick -> streamed explanation -> timed gauntlet -> verdict
  colosseum/deans-list/            # Top 500 Dean's List with podium for top 3 + your-row pinned
  api/users/sync/                  # Idempotent profile upsert called from dashboard
  api/explain/                     # POST -> text/plain stream of persona explanation
  api/gauntlet/                    # POST -> 3 MCQ Socratic questions (correct keys hidden)
  api/gauntlet/answer/             # POST -> server-side grading + reveal
  api/gauntlet/re-explain/         # POST -> text/plain stream of sharper re-explanation
  api/colosseum/drop/              # GET today's drop teaser; POST opens a session w/ canonical questions
  api/colosseum/leaderboard/       # GET top N (default 500) by Elo
  api/colosseum/submit/            # POST finalize a run -> grade -> Elo/XP/streak deltas + new rank
                                   #                     -> auto-forge spaced-repetition flashcards

  blitz/                           # 1v1 Blitz lobby (matchmaking) + live match page
  blitz/[id]/                      # STUDY -> BLITZ -> FINISHED state machine, server-authoritative
  api/blitz/queue/                 # POST join queue / DELETE leave queue
  api/blitz/[id]/                  # GET match snapshot
  api/blitz/[id]/answer/           # POST submit a blitz answer
  api/blitz/[id]/start/            # POST transition STUDY -> BLITZ
  api/blitz/[id]/advance/          # POST force the per-question watchdog (timeout / ghosting)

  rooms/                           # Study Rooms lobby (create + join via 6-digit code)
  rooms/[id]/                      # LOBBY -> STUDY -> QUIZ -> FINISHED, host-driven
  api/rooms/                       # POST create a room
  api/rooms/join/                  # POST join a room by code
  api/rooms/[id]/persona/          # POST pick your persona inside a room
  api/rooms/[id]/start/            # POST host-only: generate questions + transition to STUDY
  api/rooms/[id]/quiz/             # POST host-only: transition STUDY -> QUIZ
  api/rooms/[id]/answer/           # POST submit a room quiz answer

  flashcards/                      # Due-today flip-card review w/ keyboard shortcuts + deck browser
  api/flashcards/                  # GET due cards, full deck, box distribution
  api/flashcards/review/           # POST got_it / missed -> Leitner promotion or demotion

  radio/                           # Notes input -> persona picker -> live status -> player + transcript
  api/radio/                       # GET history; POST generate (script + ElevenLabs TTS)
  api/radio/[id]/                  # GET status poll for in-flight generations

components/
  nav.tsx                          # Top navigation with auth state
  colosseum/
    drop-countdown.tsx             # Live UTC-midnight countdown
    deans-list.tsx                 # Compact + full leaderboard renderer w/ "you" pinned
    difficulty-pip.tsx             # 1-5 difficulty pips next to a concept

lib/
  ai/
    personas.ts                    # Persona registry: explain + re-explain prompts + ElevenLabs voiceId
    client.ts                      # Anthropic model factories (env-overridable)
    explain.ts                     # streamText helpers (initial + re-explanation)
    gauntlet.ts                    # generateObject helper w/ Zod schema
    store.ts                       # In-memory gauntlet session store (server-only) w/ server-tracked
                                   #   start time + answer log + Daily Drop attribution
  colosseum/
    constants.ts                   # Tunable parameters (K-factor, XP buckets, milestones, etc.)
    elo.ts                         # performanceScore + expectedScore + eloDelta (FIDE-style K)
    xp.ts                          # XP buckets, streak rollover, today/UTC + countdown helpers
    queries.ts                     # Daily Drop lazy create, leaderboard, my-row, recent attempts
  realtime/
    constants.ts                   # Phase timers, queue TTLs, Elo K, channel naming
    client.ts                      # React hooks for Supabase Realtime (match/room/member subscriptions)
  blitz/
    elo.ts                         # 1v1 Elo helpers (K=24)
    questions.ts                   # Zod-validated 7-question pool generator (Sonnet 4.5)
    queries.ts                     # Match fetch, queue dequeue/enqueue, atomic answer + advance RPCs
  rooms/
    queries.ts                     # Code generation, host assertion, AI question gen, atomic grading
  flashcards/
    leitner.ts                     # 5-box system, promote / demote, next-review dates
    generate.ts                    # Persona-voiced card generation + best-persona resolution
    queries.ts                     # Due / all / box-distribution + review (promote/demote) writer
  radio/
    script.ts                      # 750-word multi-persona podcast script generator (Sonnet 4.5 + Zod)
    tts.ts                         # ElevenLabs Turbo v2.5 TTS w/ per-segment voice routing + concat
    queries.ts                     # Episode CRUD, status patches, storage upload, top-personas resolver
  supabase/
    server.ts, browser.ts, types.ts
  posthog/provider.tsx
  rank.ts

middleware.ts                      # Clerk middleware — protects /dashboard and /api/users/*
```

## The Influencer Synthesis Engine

The `/learn` page is the end-to-end loop:

1. **Pick** — paste a passage (or upload a `.txt`/`.md`) + select a persona.
2. **Listen** — `POST /api/explain` streams the explanation in the persona's voice via `claude-haiku-4-5`. Three "Creator Modes" from the PRD are surfaced first (**Mr. Viral**, **Tech Reviewer**, **Twitch Streamer**); the three V2 archetypes live behind a disclosure.
3. **Gauntlet** — `POST /api/gauntlet` generates 3 difficulty-escalating Socratic MCQs via `claude-sonnet-4-5` + Zod-validated structured output. Correct-answer indices are stashed server-side in `lib/ai/store.ts` so the client can never inspect them.
4. **Grade** — `POST /api/gauntlet/answer` reveals the verdict + the persona's "gotcha" describing the misconception.
5. **Re-explain on miss** — when a user answers wrong, `POST /api/gauntlet/re-explain` streams a "shorter, sharper" 80-120 word re-explanation using the persona's dedicated `reExplainPrompt` (different from the initial system prompt — it instructs the model to attack only the misconception, never to re-teach the concept).

To rotate models without code changes, override `ANTHROPIC_EXPLAIN_MODEL` and/or `ANTHROPIC_GAUNTLET_MODEL` in `.env.local`.

## The Cognitive Colosseum (Daily Drop + Dean's List)

The `/colosseum` route is the LeetCode-style competitive layer.

**Daily Drop.** At UTC midnight a single concept becomes the global challenge for the day. The first request after midnight lazily generates today's drop: a random unused concept from `concepts` plus a **canonical** set of 3 Socratic MCQs baked into `daily_drops.questions`. Every player runs the same questions, so the leaderboard is fair. Personas only change the explanation voice — they never change what's being tested.

**The flow.**

1. `/colosseum` lobby — live countdown to next drop, today's concept teaser, your stats trio (Elo / Streak / XP), and the top 10 Dean's List inline.
2. `/colosseum/play` — pick your professor, watch the streamed explanation, then `Enter the gauntlet — clock starts now`. A live timer shows your elapsed seconds. The server (not the client) measures elapsed time from the moment `POST /api/colosseum/drop` returns.
3. Three questions, scored server-side. Wrong answers offer a `Sharper re-explanation in <persona>'s voice` button that streams the persona's `reExplainPrompt` against the specific misconception.
4. After Q3, `POST /api/colosseum/submit` grades the run, computes Elo + XP + streak deltas in TypeScript ([`lib/colosseum/elo.ts`](lib/colosseum/elo.ts), [`lib/colosseum/xp.ts`](lib/colosseum/xp.ts)), and writes everything atomically through the `record_gauntlet_attempt` Postgres function.
5. Verdict screen: ranked or unranked, Elo before/after/delta, XP breakdown (studied / accuracy / perfect / drop bonus / streak bonus), streak before/after with milestone callout, new global Dean's List rank.
6. `/colosseum/deans-list` — full Top 500 with a podium for ranks 1-3 and your row pinned at the bottom if you're outside the cut.

**Performance and Elo.**

```
accuracy   = correct / 3
timeBonus  = max(0, 1 - elapsed / 180)
performance = accuracy * (0.75 + 0.25 * timeBonus)        // [0,1]

opponentElo = 1050 + 150 * difficulty                      // 1200..1800 over diff 1..5
expected    = 1 / (1 + 10 ^ ((opponentElo - playerElo)/400))
K           = 32 (under 30 ranked attempts) | 16 (FIDE-style settle)
eloDelta    = round(K * (performance - expected))
```

A 3/3 in 30s on a difficulty-3 concept against a 1500 Elo player gives perf ≈ 0.95, expected = 0.5, K = 32 → +14 Elo. Same player gets 1/3 slowly → perf ≈ 0.25, eloDelta ≈ -8.

**Ranked vs unranked.** First Daily Drop attempt of the day is **ranked** (Elo + XP + streak + leaderboard movement). Subsequent re-takes on the same drop are **unranked** (XP only — streak doesn't tick, Elo doesn't move). Free-play `/learn` is always unranked. The unique partial index `gauntlet_attempts (user_id, drop_date) where is_ranked` enforces this at the DB level.

**Streaks.** Tick only on a ranked Daily Drop completion (so spamming free-play can't keep a streak alive). Resets to 1 if you skipped a day. Crossing a 7-day milestone awards `5 * newStreakDays` bonus XP.

**Cheating resistance.** The canonical answer key never leaves the server. The session timer starts when questions are served by the server, and elapsed time is recomputed server-side on submit. The Postgres function re-checks `auth.jwt() ->> 'sub' == p_user_id` so a forged `user_id` in the RPC body fails. The unique partial index makes double-submit races a no-op.

## Real-Time Multiplayer — 1v1 Blitz & Study Rooms

**1v1 Blitz (`/blitz`).** Two players queue up, get matched on a random concept, study for 2 minutes against their picked persona's explanation, then race a sudden-death rapid-fire quiz. First to 3 correct answers wins; the loser pays Elo (K=24, FIDE-style) into the winner's pile.

```
LOBBY  →  STUDY (120s, both players see custom-tailored explanations)
                       ↓
       BLITZ (per-Q race, server breaks ties on clock_timestamp())
                       ↓
       FINISHED (winner + Elo transfer atomic in advance_blitz_question)
```

**Study Rooms (`/rooms`).** Host creates a room, gets a 6-digit join code, optionally pastes lecture notes / slide text. Up to N members join, each picks any persona, races through a host-generated quiz to a configurable pass threshold. Server-authoritative grading + finish-positions for the leaderboard.

**Why Supabase Realtime over Pusher / Socket.io?**

- We're already on Supabase. Adding Pusher means a second account, a second monthly bill, and double the auth surface (Pusher channel signing on top of Clerk JWTs).
- Socket.io needs a long-lived process. Vercel functions don't keep one. Either we deploy a separate Node service (more infra, more cost, more failure modes) or we accept polling. Supabase Realtime is purpose-built Postgres-Changes streaming over a hosted edge — no extra infra.
- All gameplay state already lives in Postgres (anti-cheat: server is the truth). Streaming row changes from Postgres directly is more honest than re-broadcasting via a separate state machine.

**Why Postgres-as-Redis (no Redis yet)?** The matchmaking queue is a single small table with `SELECT … FOR UPDATE SKIP LOCKED`. That gives us atomic dequeue without a separate ephemeral store. When we hit the scaling cliff (100k concurrent matchers, sub-10ms TTFB requirements), we'll port the queue to Upstash. The interface is already isolated in `lib/blitz/queries.ts::dequeueOrEnqueue` so the migration is local.

## Retention — Flashcard Forge & Professor Radio

**Flashcard Forge (`/flashcards`).** After every Colosseum drop and Comprehension Gauntlet completion, the server auto-forges 3-5 spaced-repetition flashcards in the user's *best* persona's voice — resolved per-concept by joining `concepts.subject_id ↔ learning_fingerprints` and picking the highest weight. Cards land in box 1, due immediately. Reviews use a classic 5-box Leitner system:

| Box | Interval | Promotion |
| --- | -------- | --------- |
| 1   | 1 day    | got it → 2 |
| 2   | 3 days   | got it → 3 |
| 3   | 7 days   | got it → 4 |
| 4   | 14 days  | got it → 5 |
| 5   | 30 days  | graduated  |

A miss at any level drops the card straight back to box 1 (Leitner's "fall to the bottom"). Daily-cap of 5 cards per concept per 24h prevents runaway generation if a user re-plays the same drop. The review UI supports keyboard shortcuts (`space` flip · `1` missed · `2` got it) and shows per-deck box distribution.

**Professor Radio (`/radio`).** Drop in lecture notes; we generate a ~750-word multi-persona podcast script with `claude-sonnet-4-5` (structured via Zod into typed `intro` / `take` / `dialog` / `outro` segments), then voice each segment with the speaker's ElevenLabs voice (`eleven_turbo_v2_5` model). Segments are concatenated into a single mp3 and uploaded to the `radio` storage bucket. The player highlights the active segment as the audio plays for sing-along studying.

**ElevenLabs cost guards.** TTS is the most expensive part of the stack, so:

- Notes are capped at 12,000 chars before they reach the model.
- Scripts are capped at 24 segments and ~750 words.
- If `ELEVENLABS_API_KEY` is missing, we **skip audio entirely** and ship the episode as `ready` with a script-only notice — no 500s, no broken UX.
- Custom-cloned voices can be wired per persona via `ELEVENLABS_VOICE_<SLUG>` env vars without code changes.
- (Roadmap) per-user monthly TTS character cap tracked in `radio_episodes`.

## Notes

- **Why not `@supabase/ssr`?** When Clerk handles auth, we don't need Supabase Auth's cookie management. The plain `@supabase/supabase-js` client with the `accessToken` callback is the cleanest pattern and works identically server-side and browser-side.
- **No service_role on the client.** All writes go through the user's own Clerk-issued JWT and are RLS-checked. The service role key is never installed in this project.
- **PostHog gracefully no-ops** if `NEXT_PUBLIC_POSTHOG_KEY` is missing or still set to the placeholder, so the app runs locally before you create a PostHog project.
- **Anti-cheat by construction.** Every score-bearing action (gauntlet grading, blitz answer ordering, room finish position, Elo transfer) is a Postgres function that re-checks `auth.jwt() ->> 'sub'` and stamps `clock_timestamp()` itself. The client never gets to send "I won" — it sends "I picked B" and the server decides what that means.

## What's next

This commit ships the full V3 vertical slice: foundation → Influencer Synthesis Engine → Comprehension Gauntlet → Cognitive Colosseum → 1v1 Blitz → Study Rooms → Flashcard Forge → Professor Radio. The follow-ups:

1. Bump each user's `learning_fingerprints` weight on every gauntlet attempt (the EMA infra is already in place; just needs the `persona_slug -> persona_id` join on submit)
2. Recharts radar chart of the user's `learning_fingerprints` on the dashboard
3. Cron-based pre-bake of tomorrow's Daily Drop questions at 23:55 UTC so the first player after midnight doesn't pay the generation latency
4. Replace the in-memory `lib/ai/store.ts` with Upstash Redis when going multi-instance (interface is already shaped for it)
5. Per-user monthly ElevenLabs character budget enforced server-side
6. Background-job runner for radio generation so the POST returns immediately and the client polls (currently the request blocks ~60s on long episodes — fine for a hackathon, not for prod)
