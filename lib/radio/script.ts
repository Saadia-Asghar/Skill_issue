import "server-only";

import { z } from "zod";

import { gauntletModel, isAnthropicConfigured } from "@/lib/ai/client";
import type { Persona, PersonaSlug } from "@/lib/ai/personas";
import { getPersona } from "@/lib/ai/personas";
import { safeGenerateObject } from "@/lib/ai/structured";

/**
 * Professor Radio script schema.
 *
 * A 5-minute episode is roughly ~750 words at podcast cadence (150 wpm).
 * We model it as a sequence of typed segments — `intro`, `take` (each
 * persona's hot take), `dialog` (alternating banter), and `outro`. The
 * TTS pass walks segments in order, looking up the persona voice for each.
 */
export const ScriptSegmentSchema = z.object({
  kind: z.enum(["intro", "take", "dialog", "outro"]),
  speaker: z.string().describe("Persona slug — must match one of the requested personas"),
  text: z
    .string()
    .min(20)
    .max(900)
    .describe(
      "Spoken text. No markdown. No stage directions. Use ellipses and short sentences for cadence.",
    ),
});

export const ScriptSchema = z.object({
  title: z.string().min(4).max(120),
  segments: z.array(ScriptSegmentSchema).min(4).max(24),
});

export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;
export type Script = z.infer<typeof ScriptSchema>;

/**
 * Generate a multi-persona podcast script (~750 words). Caps the input
 * notes to keep prompt cost predictable. Returns null if Anthropic isn't
 * configured — callers fall back to a graceful degraded state.
 */
export async function generateScript(opts: {
  notes: string;
  personas: Persona[];
  /** Soft target word count. The model is asked to land within ±15%. */
  targetWords?: number;
}): Promise<Script | null> {
  if (!isAnthropicConfigured()) return null;
  if (opts.personas.length === 0) return null;

  const targetWords = opts.targetWords ?? 750;
  const cappedNotes = opts.notes.slice(0, 6000);
  const personaList = opts.personas
    .map((p) => `- ${p.slug} ("${p.name}"): ${p.tagline}`)
    .join("\n");

  try {
    const object = await safeGenerateObject({
      model: gauntletModel,
      schema: ScriptSchema,
      system: `You are showrunning a 5-minute study podcast called "Professor Radio".

Constraints:
- Target ${targetWords} words total (±15%). Stay under ${Math.round(
        targetWords * 1.15,
      )} words.
- Use ONLY these speakers (slug-matched exactly):
${personaList}
- Each persona must speak in their distinct voice (see tagline).
- Open with a single 'intro' segment from the first persona that frames the topic.
- Then 1-2 'take' segments per persona giving their hot take.
- Then 2-4 'dialog' segments with personas reacting to each other (back-and-forth banter, NOT lecture).
- Close with an 'outro' segment that summarizes the one thing the listener should remember.
- NO markdown. NO stage directions in brackets. NO sound effects. NO citations.
- Keep sentences short — this will be read aloud. Use ellipses and dashes for breath beats.

JSON SHAPE:
{
  "title": "string (4-120 chars)",
  "segments": [
    { "kind": "intro" | "take" | "dialog" | "outro",
      "speaker": "<one of the persona slugs above>",
      "text": "string (20-900 chars, spoken aloud)" }
  ]  // 4-24 segments total
}`,
      prompt: [
        `Topic notes from the listener:`,
        ``,
        cappedNotes,
        ``,
        `Generate the episode now. Make it sound like real radio — banter, tension, payoff.`,
      ].join("\n"),
      temperature: 0.7,
    });

    // Defensive: re-map any speaker slug that the model hallucinated to the
    // closest valid slug (first persona). Hard-failing here would lose a
    // generation worth of tokens for a typo.
    const validSlugs = new Set(opts.personas.map((p) => p.slug));
    const fallbackSlug = opts.personas[0].slug;
    return {
      ...object,
      segments: object.segments.map((s) => ({
        ...s,
        speaker: validSlugs.has(s.speaker as PersonaSlug)
          ? s.speaker
          : fallbackSlug,
      })),
    };
  } catch (e) {
    console.error("[radio/script] generation failed", e);
    return null;
  }
}

/** Total word count across all segments. Useful for duration estimates. */
export function scriptWordCount(script: Script): number {
  return script.segments.reduce(
    (sum, seg) => sum + seg.text.trim().split(/\s+/).length,
    0,
  );
}

/** Resolve a slug (possibly user-provided) to a Persona, with a safe fallback. */
export function resolvePersonas(slugs: string[]): Persona[] {
  const seen = new Set<string>();
  const personas: Persona[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    const p = getPersona(slug);
    if (p) {
      personas.push(p);
      seen.add(slug);
    }
  }
  if (personas.length === 0) {
    const prof = getPersona("professor");
    if (prof) personas.push(prof);
  }
  return personas;
}
