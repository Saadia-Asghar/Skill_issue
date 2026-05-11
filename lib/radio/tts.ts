import "server-only";

import { getPersona, getVoiceId } from "@/lib/ai/personas";

import type { Script } from "./script";

/**
 * Whether the ElevenLabs API is wired up. Checked before any TTS attempt
 * so we can degrade gracefully (script-only podcast) without a 500.
 */
export function isElevenLabsConfigured(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return Boolean(key && key.length > 10);
}

/**
 * Voice a single text segment with ElevenLabs. Returns the raw mp3 bytes.
 * Uses the multilingual v2 model and the "eleven_turbo_v2_5" preset for
 * quick generation; we don't stream because we need the full bytes to
 * concat into the episode.
 */
async function voiceSegment(opts: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<Uint8Array> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId = opts.modelId ?? process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5";

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
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
}

/**
 * Walk every segment, voice it with the speaker's persona voice id, and
 * return a single concatenated mp3 buffer. We sleep ~150ms between
 * segments to stay polite with the rate limiter.
 *
 * NOTE: naive mp3 concat works because each chunk has its own frames; it's
 * not a perfect container but every player we care about (browser <audio>,
 * iOS, Android) handles this. If we ever need surgical container repair
 * we can post-process with ffmpeg.
 */
export async function voiceScript(script: Script): Promise<Uint8Array> {
  if (!isElevenLabsConfigured()) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const persona = getPersona(seg.speaker);
    if (!persona) continue;
    const voiceId = getVoiceId(persona);
    const audio = await voiceSegment({ voiceId, text: seg.text });
    chunks.push(audio);
    total += audio.byteLength;
    if (i < script.segments.length - 1) {
      await new Promise((r) => setTimeout(r, 150));
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
