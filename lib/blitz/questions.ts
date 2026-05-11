import "server-only";

import { z } from "zod";

import { gauntletModel } from "@/lib/ai/client";
import { normalizeQuestionPool } from "@/lib/ai/question-normalize";
import { safeGenerateObject } from "@/lib/ai/structured";
import { BLITZ_QUESTION_POOL } from "@/lib/realtime/constants";

/**
 * Rapid-fire Blitz questions. Same shape as the Comprehension Gauntlet so
 * scoring code can be shared, but tighter constraints:
 *
 *   - Question must be answerable in < 10s of reading + thinking
 *   - Distractors stay short (no paragraphs) to keep the UI snappy
 *   - We always generate {@link BLITZ_QUESTION_POOL} = 7 questions, since the
 *     match could go best-of-7 if both players keep tying.
 */
const BlitzQuestionSchema = z.object({
  q: z.string().describe("Concise rapid-fire question, no setup paragraph"),
  choices: z
    .array(z.string())
    .length(4)
    .describe("Four short multiple-choice options (each <= 8 words)"),
  correct_index: z.number().int().min(0).max(3),
  gotcha: z
    .string()
    .describe("One-sentence misconception that the wrong picks reveal"),
});

const BlitzPoolSchema = z.object({
  questions: z.array(BlitzQuestionSchema).length(BLITZ_QUESTION_POOL),
});

const RelaxedBlitzQuestionSchema = z.object({
  q: z.string(),
  choices: z.array(z.string()).min(2).max(8),
  correct_index: z.number().int().min(0).max(7),
  gotcha: z.string(),
});
const RelaxedBlitzPoolSchema = z.object({
  questions: z.array(RelaxedBlitzQuestionSchema).min(1).max(12),
});

export type BlitzQuestion = z.infer<typeof BlitzQuestionSchema>;

export async function generateBlitzQuestions(
  conceptText: string,
): Promise<BlitzQuestion[]> {
  const system = `You are writing questions for a 1v1 RAPID-FIRE blitz quiz.

Generate exactly ${BLITZ_QUESTION_POOL} multiple-choice questions about the concept the players just studied. Each must:

1. Be answerable in under 10 seconds — keep stems short, no preamble.
2. Have 4 short distractors, each <= 8 words.
3. Test conceptual understanding, not surface recall of phrases.
4. Mix difficulty: roughly easy/easy/medium/medium/medium/hard/hard.
5. NEVER use "all of the above" or double negatives.

JSON SHAPE:
{
  "questions": [
    { "q": "string", "choices": ["string","string","string","string"],
      "correct_index": 0|1|2|3, "gotcha": "string" }
  ]  // exactly ${BLITZ_QUESTION_POOL} items
}`;
  const prompt = [`Concept text:`, conceptText.trim()].join("\n");
  try {
    const object = await safeGenerateObject({
      model: gauntletModel,
      schema: BlitzPoolSchema,
      system,
      prompt,
      temperature: 0.4,
    });
    return object.questions;
  } catch {
    console.warn("[blitz] strict schema failed; repairing with relaxed parse");
    const relaxed = await safeGenerateObject({
      model: gauntletModel,
      schema: RelaxedBlitzPoolSchema,
      system: `${system}

CRITICAL: Each question must have exactly 4 choices.`,
      prompt,
      temperature: 0.4,
    });
    return normalizeQuestionPool(
      relaxed.questions,
      BLITZ_QUESTION_POOL,
      4,
    ) as BlitzQuestion[];
  }
}
