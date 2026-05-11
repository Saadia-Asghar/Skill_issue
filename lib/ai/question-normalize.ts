import "server-only";

type RawQuestion = {
  q?: unknown;
  choices?: unknown;
  correct_index?: unknown;
  gotcha?: unknown;
};

export type NormalizedQuestion = {
  q: string;
  choices: string[];
  correct_index: number;
  gotcha: string;
};

function hashToIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return mod > 0 ? h % mod : 0;
}

function normalizeOne(raw: RawQuestion, targetChoices: number): NormalizedQuestion {
  const q =
    typeof raw.q === "string" && raw.q.trim().length > 0
      ? raw.q.trim()
      : "Which option best matches the core idea?";
  const gotcha =
    typeof raw.gotcha === "string" && raw.gotcha.trim().length > 0
      ? raw.gotcha.trim()
      : "A common miss is confusing the key mechanism with a superficial detail.";

  const rawChoices = Array.isArray(raw.choices)
    ? raw.choices.filter((c): c is string => typeof c === "string")
    : [];
  const uniqueChoices = Array.from(
    new Set(rawChoices.map((c) => c.trim()).filter((c) => c.length > 0)),
  );

  const safeCorrectRaw =
    typeof raw.correct_index === "number" && Number.isInteger(raw.correct_index)
      ? raw.correct_index
      : 0;
  const boundedCorrect =
    uniqueChoices.length > 0
      ? Math.max(0, Math.min(uniqueChoices.length - 1, safeCorrectRaw))
      : 0;
  const correctChoice = uniqueChoices[boundedCorrect] ?? "The statement that correctly applies the core concept.";

  const distractors = uniqueChoices.filter((c) => c !== correctChoice);
  while (distractors.length < targetChoices - 1) {
    distractors.push(`Distractor ${distractors.length + 1}: plausible but incorrect.`);
  }

  const finalChoices = distractors.slice(0, targetChoices - 1);
  const correctSlot = hashToIndex(q, targetChoices);
  finalChoices.splice(correctSlot, 0, correctChoice);

  return {
    q,
    choices: finalChoices,
    correct_index: correctSlot,
    gotcha,
  };
}

/**
 * Repairs malformed LLM question payloads into a safe, fixed-size pool.
 * This prevents schema drift (e.g. 5 choices) from reaching clients.
 */
export function normalizeQuestionPool(
  input: unknown,
  targetQuestions: number,
  targetChoices: number,
): NormalizedQuestion[] {
  const arr = Array.isArray(input) ? input : [];
  const normalized = arr.map((q) => normalizeOne((q ?? {}) as RawQuestion, targetChoices));

  while (normalized.length < targetQuestions) {
    normalized.push(
      normalizeOne(
        {
          q: `Question ${normalized.length + 1}: which option is most accurate?`,
          choices: [],
          correct_index: 0,
          gotcha:
            "The trap is focusing on wording instead of the underlying concept.",
        },
        targetChoices,
      ),
    );
  }

  return normalized.slice(0, targetQuestions);
}
