import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isAnthropicConfigured } from "@/lib/ai/client";
import {
  createEpisode,
  failEpisode,
  fetchMyEpisodes,
  fetchTopPersonas,
  updateEpisode,
  uploadEpisodeAudio,
} from "@/lib/radio/queries";
import { humanizeSupabaseError } from "@/lib/supabase/errors";
import { ensureUserRow } from "@/lib/users/ensure";
import {
  generateScript,
  resolvePersonas,
  scriptWordCount,
} from "@/lib/radio/script";
import {
  activeTtsProvider,
  estimatedDurationSeconds,
  isElevenLabsConfigured,
  voiceScript,
} from "@/lib/radio/tts";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long generation paths (script + TTS) — bump runtime for Vercel.
export const maxDuration = 300;

/**
 * GET /api/radio
 * Returns the user's full episode history (newest first).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const episodes = await fetchMyEpisodes(userId);
  return NextResponse.json({ episodes });
}

/**
 * POST /api/radio
 * Body: { notes: string, title?: string, personaSlugs?: string[] }
 *
 * Creates a `pending` episode immediately, then drives the script -> TTS
 * pipeline. We *don't* fire-and-forget — Vercel kills detached promises
 * after the response — so the request blocks until either the audio is
 * uploaded or we mark the episode `failed`. The client polls
 * GET /api/radio/[id] for status updates and renders progress live.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    notes?: unknown;
    title?: unknown;
    personaSlugs?: unknown;
  };
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim()
      : notes.split("\n")[0]?.slice(0, 80).trim() || "Untitled episode";
  const personaSlugs = Array.isArray(body.personaSlugs)
    ? body.personaSlugs.filter((s): s is string => typeof s === "string")
    : [];

  if (notes.length < 40) {
    return NextResponse.json(
      { error: "Notes must be at least 40 characters." },
      { status: 400 },
    );
  }

  const slugs =
    personaSlugs.length > 0 ? personaSlugs : await fetchTopPersonas(userId, 3);
  const personas = resolvePersonas(slugs);
  if (personas.length === 0) {
    return NextResponse.json(
      { error: "No valid personas resolved." },
      { status: 400 },
    );
  }

  let episode;
  try {
    await ensureUserRow(userId);
    episode = await createEpisode({ userId, title, sourceText: notes });
  } catch (e) {
    const h = humanizeSupabaseError(e);
    return NextResponse.json(
      { error: h.message, hint: h.hint },
      { status: h.status },
    );
  }

  // ---- Script ----
  await updateEpisode(episode.id, { status: "scripting" });
  const script = await generateScript({ notes, personas });
  if (!script) {
    await failEpisode(
      episode.id,
      "Script generation failed. Try shortening or clarifying your notes.",
    );
    return NextResponse.json(
      { id: episode.id, status: "failed", error: "Script generation failed." },
      { status: 502 },
    );
  }
  const wordCount = scriptWordCount(script);
  const durationSeconds = estimatedDurationSeconds(script);

  // ---- TTS (graceful degrade) ----
  if (!isElevenLabsConfigured()) {
    await updateEpisode(episode.id, {
      status: "ready",
      script: script as unknown as Json,
      title: script.title || title,
      word_count: wordCount,
      duration_seconds: durationSeconds,
      error_message:
        "Audio generation skipped — ELEVENLABS_API_KEY not configured. Script is available below.",
    });
    return NextResponse.json({
      id: episode.id,
      status: "ready",
      audio_url: null,
      script,
      degraded: true,
    });
  }

  await updateEpisode(episode.id, {
    status: "voicing",
    script: script as unknown as Json,
    title: script.title || title,
    word_count: wordCount,
    duration_seconds: durationSeconds,
  });

  // Voice the script first; if that fails for a *recoverable* reason we keep
  // the episode and surface the transcript. Storage upload is a separate
  // concern handled below — we never fail the episode just because the
  // bucket rejected the bytes.
  let audioBytes: Uint8Array | null = null;
  try {
    audioBytes = await voiceScript(script);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Voice generation failed";
    const provider = activeTtsProvider();
    const lower = message.toLowerCase();
    const isProviderBlock =
      /\b401\b|\b403\b|\b429\b|unauthorized|forbidden|quota|unusual activity|free tier|payment required|insufficient_quota|rate.?limit/.test(
        lower,
      );

    if (isProviderBlock) {
      const providerLabel =
        provider === "google"
          ? "Google Cloud TTS"
          : provider === "elevenlabs"
            ? "ElevenLabs"
            : "the TTS provider";
      const hint =
        provider === "elevenlabs"
          ? "ElevenLabs free tier is often blocked on cloud/VPN IPs. Easiest fix: drop a Google Cloud TTS key into GOOGLE_CLOUD_TTS_API_KEY (1M chars/mo free, no IP blocks)."
          : "Check that the API is enabled and the key is unrestricted (or restricted to the right API).";

      await updateEpisode(episode.id, {
        status: "ready",
        audio_url: null,
        error_message: `Audio unavailable from ${providerLabel} (${message.slice(0, 160)}). The script below is the full episode — read it like a transcript.`,
      });
      return NextResponse.json({
        id: episode.id,
        status: "ready",
        audio_url: null,
        script,
        degraded: true,
        hint,
      });
    }

    await failEpisode(episode.id, message);
    return NextResponse.json(
      { id: episode.id, status: "failed", error: message },
      { status: 502 },
    );
  }

  // Audio is in hand. Try to upload; if the bucket rejects us, still ship
  // the script as a transcript so the user gets *something* useful.
  try {
    const audioUrl = await uploadEpisodeAudio({
      userId,
      episodeId: episode.id,
      bytes: audioBytes,
    });
    await updateEpisode(episode.id, {
      status: "ready",
      audio_url: audioUrl,
      error_message: null,
    });
    return NextResponse.json({
      id: episode.id,
      status: "ready",
      audio_url: audioUrl,
      script,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Audio upload failed";
    await updateEpisode(episode.id, {
      status: "ready",
      audio_url: null,
      error_message: `Audio was generated but couldn't be saved to storage (${message.slice(0, 160)}). Transcript is below.`,
    });
    return NextResponse.json({
      id: episode.id,
      status: "ready",
      audio_url: null,
      script,
      degraded: true,
      hint: "Storage upload was blocked (usually a Supabase Storage RLS policy). The transcript is preserved.",
    });
  }
}
