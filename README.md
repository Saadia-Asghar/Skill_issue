# 🕹️ Professor Decompose V3 — The Cognitive Arena

> **The LeetCode of Learning.** An addictive arcade-style study platform that identifies which pedagogical styles actually make information stick for you. Learn through "Influencer Personas," validate retention via the **Comprehension Gauntlet**, and climb the global **Dean's List** Elo leaderboard.

## 🚀 The Vertical Slice

Professor Decompose isn't just a wrapper; it’s a full-stack learning ecosystem:

* **Influencer Synthesis Engine:** Transform dry text into viral-style explanations (Mr. Viral, Tech Reviewer, Twitch Streamer).
* **Cognitive Colosseum:** Daily global challenges where everyone faces the same concept and "canonical" questions for a fair leaderboard.
* **1v1 Blitz & Study Rooms:** Real-time multiplayer modes powered by Supabase Realtime—race to answer correctly and win Elo.
* **Flashcard Forge:** Automated Spaced Repetition (SRS) using a 5-box Leitner system, voiced by your favorite persona.
* **Professor Radio:** Convert lecture notes into multi-persona podcast episodes using ElevenLabs Turbo v2.5.

## 🛠️ Technical Stack

| Layer | Technology |
| --- | --- |
| **Framework** | **Next.js 15** (App Router, TypeScript, Turbopack) |
| **Styling** | **Tailwind CSS v4** + Framer Motion for bouncy arcade transitions |
| **Auth** | **Clerk** (Integrated with Supabase via JWT verification) |
| **Database** | **Supabase Postgres** with Row Level Security (RLS) |
| **Realtime** | **Supabase Realtime** (Postgres-Changes) for 1v1 Blitz & Study Rooms |
| **LLMs** | **Vercel AI SDK** routing (Groq/Llama 3.3 70B, Gemini 2.0, Claude 3.5) |
| **Voice** | **ElevenLabs Turbo v2.5** (High-speed TTS for Professor Radio) |
| **Analytics** | **PostHog** (Autocapture + identified pageviews) |

## 🏗️ Architecture & Security

* **Server-Authoritative Gameplay:** All score-bearing actions (Gauntlet grading, Blitz timing) happen in Postgres RPCs. The client never sees the answer key; it only sends choices.
* **Cognitive Mapping:** The `learning_fingerprints` table tracks your retention success across different personas and subjects using an Exponential Moving Average (EMA).
* **Race-Condition Protection:** Uses `SELECT FOR UPDATE SKIP LOCKED` for atomic matchmaking in the 1v1 Blitz queue.

## 🏁 Getting Started

### 1. Prerequisites

You will need accounts for **Supabase**, **Clerk**, **PostHog**, and at least one LLM provider (Groq is recommended for the free tier).

### 2. Installation

```bash
# Clone the repo
git clone https://github.com/zakaryaahm3d/Hack.git

# Install dependencies
bun install

```

### 3. Environment Setup

Create a `.env.local` file and fill in the following:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_POSTHOG_KEY=phc_...

# Recommended: https://console.groq.com/keys
GROQ_API_KEY=gsk_...

# Optional: For Professor Radio Audio
ELEVENLABS_API_KEY=...

```

### 4. Run Development

```bash
bun dev

```

Visit `http://localhost:3000` to enter the arena.

## 📈 Roadmap

* [ ] **Radar Charts:** Visualizing the "Cognitive Map" on the user dashboard.
* [ ] **Daily Drop Pre-baking:** Cron jobs to generate tomorrow's questions to eliminate latency.
* [ ] **Upstash Integration:** Moving the matchmaking queue to Redis for sub-10ms performance at scale.
