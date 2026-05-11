import "server-only";

import { generateObject } from "ai";
import { z } from "zod";

import { gauntletModel } from "@/lib/ai/client";
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

export type BlitzQuestion = z.infer<typeof BlitzQuestionSchema>;

export async function generateBlitzQuestions(
  conceptText: string,
): Promise<BlitzQuestion[]> {
  const { object } = await generateObject({
    model: gauntletModel,
    schema: BlitzPoolSchema,
    system: `You are writing questions for a 1v1 RAPID-FIRE blitz quiz.

Generate exactly ${BLITZ_QUESTION_POOL} multiple-choice questions about the concept the players just studied. Each must:

1. Be answerable in under 10 seconds — keep stems short, no preamble.
2. Have 4 short distractors, each <= 8 words.
3. Test conceptual understanding, not surface recall of phrases.
4. Mix difficulty: roughly easy/easy/medium/medium/medium/hard/hard.
5. NEVER use "all of the above" or double negatives.

Return strictly valid JSON matching the schema.`,
    prompt: [`Concept text:`, conceptText.trim()].join("\n"),
    temperature: 0.4,
  });

  return object.questions;
}
