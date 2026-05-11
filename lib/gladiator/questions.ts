import type { Json } from "@/lib/supabase/types";

export type GladiatorQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: number;
};

const FALLBACK_BANK: GladiatorQuestion[] = [
  {
    id: "gq-1",
    prompt: "Which tactic keeps your health highest in timed quiz combat?",
    options: [
      "Guess instantly every round",
      "Read once, answer with confidence",
      "Wait until timer almost ends",
      "Skip every second question",
    ],
    correctIndex: 1,
    difficulty: 1,
  },
  {
    id: "gq-2",
    prompt: "A harder concept should usually imply what for bot success rate?",
    options: [
      "Higher success chance",
      "No change at all",
      "Lower success chance",
      "Always 100% success",
    ],
    correctIndex: 2,
    difficulty: 3,
  },
  {
    id: "gq-3",
    prompt: "What is the best meaning of atomic purchase logic?",
    options: [
      "Two buys can race safely",
      "Points can go negative once",
      "Lock + debit + insert in one transaction",
      "Debit in frontend, verify later",
    ],
    correctIndex: 2,
    difficulty: 2,
  },
];

export function pickOpeningQuestion(seed: string): GladiatorQuestion {
  const idx = Math.abs(hash(seed)) % FALLBACK_BANK.length;
  return FALLBACK_BANK[idx]!;
}

export function toQuestionJson(question: GladiatorQuestion): Json {
  return question as unknown as Json;
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return h;
}
