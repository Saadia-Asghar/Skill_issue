import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Anthropic provider. Reads `ANTHROPIC_API_KEY` from the environment by
 * default; declared explicitly here so we can fail fast in `assertConfigured`.
 */
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Model used for streamed persona explanations. Haiku 4.5 balances tone
 * fidelity with sub-second TTFT — perfect for the "feels alive" stream.
 * Override via `ANTHROPIC_EXPLAIN_MODEL`.
 */
export const explainModel = anthropic(
  process.env.ANTHROPIC_EXPLAIN_MODEL ?? "claude-haiku-4-5",
);

/**
 * Model used for Comprehension Gauntlet question generation. Sonnet 4.5
 * gives noticeably better distractors and difficulty escalation when asked
 * for structured JSON output.
 * Override via `ANTHROPIC_GAUNTLET_MODEL`.
 */
export const gauntletModel = anthropic(
  process.env.ANTHROPIC_GAUNTLET_MODEL ?? "claude-sonnet-4-5",
);

export function isAnthropicConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.startsWith("sk-ant-"));
}
