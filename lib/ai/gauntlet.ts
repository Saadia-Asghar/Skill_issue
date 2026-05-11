import "server-only";

import { z } from "zod";

import { gauntletModel } from "./client";
import {
  normalizeQuestionPool,
  type NormalizedQuestion,
} from "./question-normalize";
import type { Persona } from "./personas";
import { safeGenerateObject } from "./structured";

/** A single Comprehension Gauntlet multiple-choice question. */
export const QuestionSchema = z.object({
  q: z.string().describe("The Socratic question — concise, no preamble"),
  choices: z
    .array(z.string())
    .length(4)
    .describe("Exactly 4 multiple-choice options of comparable length"),
  correct_index: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe("Zero-based index of the single correct choice"),
  gotcha: z
    .string()
    .describe(
      "One sentence describing the most common wrong answer and the misconception it reveals",
    ),
});

export const GauntletSchema = z.object({
  questions: z.array(QuestionSchema).length(3),
});

const RelaxedQuestionSchema = z.object({
  q: z.string(),
  choices: z.array(z.string()).min(2).max(8),
  correct_index: z.number().int().min(0).max(7),
  gotcha: z.string(),
});
const RelaxedGauntletSchema = z.object({
  questions: z.array(RelaxedQuestionSchema).min(1).max(8),
});

export type GauntletQuestion = z.infer<typeof QuestionSchema>;

export type GenerateGauntletOptions = {
  persona: Persona;
  text: string;
  explanation: string;
};

/**
 * Generate the 3-question Comprehension Gauntlet. Difficulty escalates:
 * Q1 = recall, Q2 = application, Q3 = transfer to a novel scenario.
 *
 * Returned questions include `correct_index` and `gotcha` — they are
 * stored server-side in the session store and stripped before sending
 * to the client (so client-side answer-grading is impossible).
 */
export async function generateGauntlet({
  persona,
  text,
  explanation,
}: GenerateGauntletOptions): Promise<GauntletQuestion[]> {
  const system = `You are a Socratic examiner generating a 3-question Comprehension Gauntlet.

The student just read an explanation in the voice of: ${persona.name} (${persona.tagline}).

Write 3 multiple-choice questions that:
1. Test CONCEPTUAL UNDERSTANDING, not memorization of phrases used in the explanation.
2. Escalate in difficulty: Q1 = recall, Q2 = application, Q3 = transfer to a novel scenario.
3. Each has ONE clearly correct answer and 3 plausible distractors that target common misconceptions.
4. Use a tone that loosely matches the persona — punchy if the persona is, formal if formal — but never sacrifice clarity.
5. Avoid trick questions, double negatives, and "all of the above".

JSON SHAPE:
{
  "questions": [
    { "q": "string", "choices": ["string","string","string","string"],
      "correct_index": 0|1|2|3, "gotcha": "string" }
  ]  // exactly 3 items
}`;
  const prompt = [
    `Source concept:`,
    text.trim(),
    ``,
    `Explanation the student just read:`,
    explanation.trim(),
  ].join("\n");

  try {
    const object = await safeGenerateObject({
      model: gauntletModel,
      schema: GauntletSchema,
      system,
      prompt,
      temperature: 0.4,
    });
    return object.questions;
  } catch {
    console.warn("[gauntlet] strict schema failed; repairing with relaxed parse");
    const relaxed = await safeGenerateObject({
      model: gauntletModel,
      schema: RelaxedGauntletSchema,
      system: `${system}

CRITICAL: Exactly 4 choices per question. Never output 5+ choices.`,
      prompt,
      temperature: 0.4,
    });
    const repaired = normalizeQuestionPool(relaxed.questions, 3, 4);
    return repaired as NormalizedQuestion[] as GauntletQuestion[];
  }
}
