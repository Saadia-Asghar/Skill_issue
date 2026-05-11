import "server-only";

import { z } from "zod";

import { explainModel, isAnthropicConfigured } from "@/lib/ai/client";
import type { Persona, PersonaSlug } from "@/lib/ai/personas";
import { getPersona } from "@/lib/ai/personas";
import { safeGenerateObject } from "@/lib/ai/structured";
import { getAnonServerSupabase } from "@/lib/supabase/server";
import type { Database, FlashcardSource } from "@/lib/supabase/types";

/** A single generated flashcard before persistence. */
export const GeneratedCardSchema = z.object({
  front: z
    .string()
    .min(8)
    .max(180)
    .describe("Short question / prompt that goes on the front of the card"),
  back: z
    .string()
    .min(12)
    .max(360)
    .describe(
      "Concise answer in the persona's voice — 1–3 sentences, never longer",
    ),
});

export const GeneratedCardListSchema = z.object({
  cards: z.array(GeneratedCardSchema).min(3).max(5),
});

export type GeneratedCard = z.infer<typeof GeneratedCardSchema>;

/**
 * Generate 3-5 flashcards for a concept in the voice of a persona. The card
 * front is a question/prompt, the back is the persona-voiced answer.
 */
export async function generateFlashcards(opts: {
  conceptText: string;
  conceptTitle: string;
  persona: Persona;
}): Promise<GeneratedCard[]> {
  if (!isAnthropicConfigured()) {
    return [];
  }
  try {
    const object = await safeGenerateObject({
      model: explainModel,
      schema: GeneratedCardListSchema,
      system: `You are turning a concept into 3-5 spaced-repetition flashcards in the voice of: ${opts.persona.name} — ${opts.persona.tagline}.

Rules:
- Each card tests ONE distinct fact / mechanism / gotcha.
- Fronts are questions or short prompts (8-30 words). Never give the answer away.
- Backs are 1-3 short sentences in the persona's voice — punchy, memorable.
- Avoid restating the concept's title verbatim.
- No markdown, no bullet lists, no "Q:" / "A:" prefixes.
- Mix difficulty: at least one easy recall card and one application card.

JSON SHAPE:
{
  "cards": [
    { "front": "string (8-180 chars)", "back": "string (12-360 chars)" }
  ]  // 3-5 items
}`,
      prompt: [
        `Concept: ${opts.conceptTitle}`,
        ``,
        `Concept body:`,
        opts.conceptText.trim(),
      ].join("\n"),
      temperature: 0.5,
    });
    return object.cards;
  } catch {
    return [];
  }
}

/**
 * Persist a batch of generated cards into Postgres. Returns the new rows.
 */
export async function saveFlashcards(opts: {
  userId: string;
  conceptId: string | null;
  source: FlashcardSource;
  personaSlug: PersonaSlug;
  cards: GeneratedCard[];
}) {
  if (opts.cards.length === 0) return [] as Database["public"]["Tables"]["flashcards"]["Row"][];
  const supabase = getAnonServerSupabase();
  const rows: Database["public"]["Tables"]["flashcards"]["Insert"][] = opts.cards.map(
    (c) => ({
      user_id: opts.userId,
      concept_id: opts.conceptId,
      source: opts.source,
      persona_slug: opts.personaSlug,
      front: c.front,
      back: c.back,
      box: 1,
      next_review_at: new Date().toISOString(),
    }),
  );
  const { data, error } = await supabase
    .from("flashcards")
    .insert(rows)
    .select("*");
  if (error) {
    console.error("[flashcards] save failed", error);
    return [];
  }
  return data ?? [];
}

/**
 * Resolve the user's "best persona" for a concept's subject — i.e. the one
 * with the highest fingerprint weight. Falls back to the persona they used
 * for the run (`fallback`) so we never block on a missing fingerprint.
 *
 * Cross-walks: `concepts.subject_id` → `learning_fingerprints (subject, persona, weight)`
 * → `personas.slug`. The persona registry is the source of truth for the
 * `slug → Persona` mapping.
 */
export async function resolveBestPersona(opts: {
  userId: string;
  conceptId: string | null;
  fallback: PersonaSlug;
}): Promise<Persona> {
  const fallbackPersona = getPersona(opts.fallback);
  if (!opts.conceptId || !fallbackPersona) {
    return fallbackPersona ?? getPersona("professor")!;
  }
  const supabase = getAnonServerSupabase();
  const { data: concept } = await supabase
    .from("concepts")
    .select("subject_id")
    .eq("id", opts.conceptId)
    .maybeSingle();
  const subjectId = concept?.subject_id;
  if (!subjectId) return fallbackPersona;

  const { data: best } = await supabase
    .from("learning_fingerprints")
    .select("persona:personas(slug), weight")
    .eq("user_id", opts.userId)
    .eq("subject_id", subjectId)
    .order("weight", { ascending: false })
    .limit(1)
    .maybeSingle();
  const slug = (best?.persona as { slug?: string } | null)?.slug;
  if (slug) {
    const p = getPersona(slug);
    if (p) return p;
  }
  return fallbackPersona;
}

/**
 * High-level "generate & save" used by the post-gauntlet hook. Caps at 5
 * cards per concept-per-day to prevent runaway generation. Best-effort —
 * returns the saved rows but never throws (we don't want to fail a gauntlet
 * submission because flashcard generation hiccupped).
 */
export async function autoForgeFlashcards(opts: {
  userId: string;
  conceptId: string | null;
  conceptTitle: string;
  conceptText: string;
  source: FlashcardSource;
  personaSlug: PersonaSlug;
}) {
  try {
    if (opts.conceptId) {
      const supabase = getAnonServerSupabase();
      const since = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const { count } = await supabase
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", opts.userId)
        .eq("concept_id", opts.conceptId)
        .gte("created_at", since);
      if ((count ?? 0) >= 5) return [];
    }

    const persona = await resolveBestPersona({
      userId: opts.userId,
      conceptId: opts.conceptId,
      fallback: opts.personaSlug,
    });
    const cards = await generateFlashcards({
      conceptTitle: opts.conceptTitle,
      conceptText: opts.conceptText,
      persona,
    });
    if (cards.length === 0) return [];
    return await saveFlashcards({
      userId: opts.userId,
      conceptId: opts.conceptId,
      source: opts.source,
      personaSlug: persona.slug,
      cards,
    });
  } catch (e) {
    console.error("[flashcards] auto-forge failed", e);
    return [];
  }
}
