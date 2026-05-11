import "server-only";

import { z } from "zod";

import { gauntletModel } from "./client";
import type { Persona } from "./personas";
import { safeGenerateObject } from "./structured";

const RoastToastSchema = z.object({
  mode: z.enum(["roast", "toast"]),
  slang_verdict: z.string().min(8).max(140),
});

export type RoastToastVerdict = z.infer<typeof RoastToastSchema>;

type GenerateRoastToastOptions = {
  persona: Persona;
  conceptText: string;
  question: string;
  userChoice: string;
  correctAnswer: string;
  isCorrect: boolean;
  recentVerdicts?: string[];
  losingStreak?: number;
};

type RoastToastIntensity = "playful" | "balanced" | "savage";

function configuredIntensity(): RoastToastIntensity {
  const raw = process.env.ROAST_TOAST_INTENSITY?.toLowerCase();
  if (raw === "playful" || raw === "balanced" || raw === "savage") return raw;
  return "balanced";
}

function styleGuide(intensity: RoastToastIntensity): string {
  if (intensity === "playful") {
    return [
      "- Tone target: playful banter; tease lightly.",
      "- Roast should feel cheeky, not harsh.",
      "- Prefer friendly hype and low-burn jokes.",
    ].join("\n");
  }
  if (intensity === "savage") {
    return [
      "- Tone target: sharp, high-heat competitive banter.",
      "- Roast can be intense, but avoid hate/abuse.",
      "- Keep it concise and punchy; no long paragraphs.",
    ].join("\n");
  }
  return [
    "- Tone target: balanced competitive banter.",
    "- Roast is witty but not overboard.",
    "- Keep energy high and concise.",
  ].join("\n");
}

function fallbackVerdict(opts: GenerateRoastToastOptions): RoastToastVerdict {
  const roasts = [
    "bro really locked that in with confidence... cooked.",
    "caught in 4k. that pick was a full skill issue.",
    "my brother in christ, that answer was never making finals.",
    "you sprinted into the wrong lane. absolutely cooked.",
  ];
  const toasts = [
    "W. you read the play perfectly.",
    "let him cook — that answer was clean.",
    "actual gigachad read. rent free in the answer key.",
    "certified W. textbook execution.",
  ];
  const list = opts.isCorrect ? toasts : roasts;
  const idx =
    Math.abs(
      `${opts.question}:${opts.userChoice}:${opts.correctAnswer}`.length,
    ) % list.length;
  return {
    mode: opts.isCorrect ? "toast" : "roast",
    slang_verdict: list[idx],
  };
}

export async function generateRoastToastVerdict(
  opts: GenerateRoastToastOptions,
): Promise<RoastToastVerdict> {
  const recent = (opts.recentVerdicts ?? []).slice(-3);
  const losingStreak = Math.max(0, opts.losingStreak ?? 0);
  const intensity = configuredIntensity();
  try {
    const object = await safeGenerateObject({
      model: gauntletModel,
      schema: RoastToastSchema,
      system: `You produce one-line "Roast & Toast" verdicts for quiz answers.

Rules:
- Output MUST be short, punchy, meme-native internet slang.
- Keep slang_verdict <= 120 chars.
- No apologies, no formal AI tone, no generic classroom phrasing.
- If wrong -> roast the misconception (mode=roast) with witty, non-hate language.
- If correct -> hype hard (mode=toast).
- Vary phrasing naturally; avoid repeating the same catchphrase.
- If losing_streak >= 2 and mode=roast, reference the streak briefly.
- Avoid slurs, threats, demeaning protected groups, or harassment beyond playful competitive banter.
${styleGuide(intensity)}

Return only schema fields.`,
      prompt: [
        `intensity_mode: ${intensity}`,
        `persona: ${opts.persona.name} (${opts.persona.tagline})`,
        `is_correct: ${opts.isCorrect ? "true" : "false"}`,
        `question: ${opts.question}`,
        `user_choice: ${opts.userChoice}`,
        `correct_answer: ${opts.correctAnswer}`,
        `concept_excerpt: ${opts.conceptText.slice(0, 600)}`,
        `recent_verdicts: ${recent.length > 0 ? recent.join(" | ") : "(none)"}`,
        `losing_streak: ${losingStreak}`,
      ].join("\n"),
      temperature: 0.9,
    });
    return {
      mode: object.mode,
      slang_verdict: object.slang_verdict.slice(0, 120),
    };
  } catch {
    const fallback = fallbackVerdict(opts);
    if (!opts.isCorrect && losingStreak >= 2) {
      return {
        ...fallback,
        slang_verdict: `${fallback.slang_verdict} ${losingStreak} Ls in a row.`,
      };
    }
    return fallback;
  }
}
