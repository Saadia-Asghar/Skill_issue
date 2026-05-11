import "server-only";

import { getPersona, getVoiceId, type PersonaSlug } from "@/lib/ai/personas";

import type { Script } from "./script";

/**
 * Multi-provider TTS layer for Professor Radio.
 *
 * Provider preference (highest first):
 *   1. Google Cloud Text-to-Speech — set GOOGLE_CLOUD_TTS_API_KEY
 *      (FREE: 1M chars/mo Neural2, 4M chars/mo standard. No IP blocks.)
 *   2. ElevenLabs                  — set ELEVENLABS_API_KEY
 *      (FREE: 10k chars/mo. Free tier blocked from many cloud/VPN IPs.)
 *   3. None — episodes degrade to script-only (transcript view).
 *
 * Both providers return raw mp3 bytes; the player concatenates segment chunks
 * naively (mp3 frame headers are self-contained, so this works in every
 * browser <audio> element).
 */

type TtsProvider = "google" | "elevenlabs" | "none";

export function activeTtsProvider(): TtsProvider {
  if (isGoogleTtsConfigured()) return "google";
  if (isElevenLabsConfigured()) return "elevenlabs";
  return "none";
}

/** True iff *any* supported TTS provider is configured. */
export function isTtsConfigured(): boolean {
  return activeTtsProvider() !== "none";
}

/**
 * Back-compat shim — radio route still calls this name. Returns true if any
 * TTS provider is configured (not just ElevenLabs).
 */
export function isElevenLabsConfigured(): boolean {
  return isTtsConfigured();
}

function isGoogleTtsConfigured(): boolean {
  const key = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  return Boolean(key && key.length > 10 && key !== "REPLACE_ME");
}

function isElevenLabsConfiguredInternal(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return Boolean(key && key.length > 10 && key !== "REPLACE_ME");
}

// -------------------------------------------------------------------------
// Google Cloud Text-to-Speech
// -------------------------------------------------------------------------

/**
 * Persona → Google Cloud Neural2 voice mapping.
 *
 * Neural2 voices are the highest-quality free-tier option (1M chars/mo).
 * Listing: https://cloud.google.com/text-to-speech/docs/voices
 *
 * Voice picks are tuned for persona vibe — not a perfect match, but each
 * persona gets a *distinct* voice so a multi-host episode sounds like a
 * real conversation, not one narrator.
 */
const GOOGLE_VOICES: Record<PersonaSlug, { name: string; rate: number; pitch: number }> = {
  mr_viral:        { name: "en-US-Neural2-J", rate: 1.15, pitch:  2.0 }, // young male, energetic
  tech_reviewer:   { name: "en-US-Neural2-D", rate: 0.98, pitch: -1.0 }, // measured male
  twitch_streamer: { name: "en-US-Neural2-I", rate: 1.10, pitch:  1.0 }, // casual male
  drill_sergeant:  { name: "en-US-Neural2-A", rate: 1.05, pitch: -3.0 }, // deep authoritative
  gen_z:           { name: "en-US-Neural2-F", rate: 1.05, pitch:  1.5 }, // warm female
  professor:       { name: "en-US-Neural2-D", rate: 0.95, pitch:  0.0 }, // calm male
};

async function googleVoiceSegment(opts: {
  slug: PersonaSlug;
  text: string;
}): Promise<Uint8Array> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY!;
  const v = GOOGLE_VOICES[opts.slug] ?? GOOGLE_VOICES.professor;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: opts.text },
        voice: { languageCode: "en-US", name: v.name },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: v.rate,
          pitch: v.pitch,
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Google Cloud TTS failed (${res.status}): ${errBody.slice(0, 220)}`,
    );
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) {
    throw new Error("Google Cloud TTS returned no audioContent");
  }
  return Uint8Array.from(Buffer.from(json.audioContent, "base64"));
}

// -------------------------------------------------------------------------
// ElevenLabs
// -------------------------------------------------------------------------

async function elevenLabsVoiceSegment(opts: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<Uint8Array> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId =
    opts.modelId ?? process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${errBody.slice(0, 200)}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Walk every segment, voice it with the active provider, and return a single
 * concatenated mp3 buffer. We sleep ~120ms between segments to stay polite
 * with rate limiters.
 *
 * NOTE: naive mp3 concat works because each chunk has its own frame headers.
 * Every browser <audio> element (and iOS / Android) handles this; if we ever
 * need surgical container repair we can post-process with ffmpeg.
 */
export async function voiceScript(script: Script): Promise<Uint8Array> {
  const provider = activeTtsProvider();
  if (provider === "none") {
    throw new Error(
      "No TTS provider configured (set GOOGLE_CLOUD_TTS_API_KEY or ELEVENLABS_API_KEY)",
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const persona = getPersona(seg.speaker);
    if (!persona) continue;

    let audio: Uint8Array;
    if (provider === "google") {
      audio = await googleVoiceSegment({
        slug: persona.slug,
        text: seg.text,
      });
    } else {
      audio = await elevenLabsVoiceSegment({
        voiceId: getVoiceId(persona),
        text: seg.text,
      });
    }

    chunks.push(audio);
    total += audio.byteLength;
    if (i < script.segments.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Estimated playback seconds at podcast cadence (~150 words/minute).
 * Used to populate `radio_episodes.duration_seconds` until we wire up a
 * real probe.
 */
export function estimatedDurationSeconds(script: Script): number {
  const words = script.segments.reduce(
    (sum, s) => sum + s.text.trim().split(/\s+/).length,
    0,
  );
  return Math.max(30, Math.round((words / 150) * 60));
}
