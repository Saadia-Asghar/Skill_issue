import "server-only";

import { streamText } from "ai";

import { explainModel } from "./client";
import type { Persona } from "./personas";

export type ExplainOptions = {
  persona: Persona;
  text: string;
};

/**
 * Stream an initial deep explanation of `text` in the persona's voice.
 * The stream is text/plain — clients consume it with `Response.body`'s
 * reader, no AI SDK runtime required on the client.
 */
export function streamExplanation({ persona, text }: ExplainOptions) {
  return streamText({
    model: explainModel,
    system: persona.systemPrompt,
    prompt: `Explain this concept in your signature style. Stay accurate, but make it land:\n\n${text.trim()}`,
    temperature: 0.85,
  });
}

export type ReExplainOptions = {
  persona: Persona;
  text: string;
  question: string;
  userChoice: string;
  correctAnswer: string;
  roastToastVerdict?: string;
  recentVerdicts?: string[];
  losingStreak?: number;
};

/**
 * Stream a "shorter, sharper" re-explanation triggered when the user gets a
 * Gauntlet question wrong. The persona's `reExplainPrompt` enforces brevity
 * and instructs the model to attack ONLY the misconception revealed by the
 * wrong choice — never to re-teach the whole concept.
 */
export function streamReExplanation({
  persona,
  text,
  question,
  userChoice,
  correctAnswer,
  roastToastVerdict,
  recentVerdicts = [],
  losingStreak = 0,
}: ReExplainOptions) {
  return streamText({
    model: explainModel,
    system: persona.reExplainPrompt,
    prompt: [
      `Concept being learned:`,
      text.trim(),
      ``,
      `Question they faced:`,
      question,
      ``,
      `What they picked: ${userChoice}`,
      `Correct answer: ${correctAnswer}`,
      ``,
      `Roast & Toast verdict to anchor your opener: ${roastToastVerdict ?? "(none provided)"}`,
      `Recent verdict memory (last ${Math.min(3, recentVerdicts.length)}): ${
        recentVerdicts.length > 0 ? recentVerdicts.slice(-3).join(" | ") : "(none)"
      }`,
      `Current losing streak count: ${losingStreak}`,
      ``,
      `Format rules:`,
      `1) First line is the punchy verdict only (<=110 chars).`,
      `2) Then the re-explanation in persona voice.`,
      `3) Keep total response under 220 words.`,
      `4) Fix only the misconception from the wrong pick.`,
    ].join("\n"),
    temperature: 0.7,
  });
}
