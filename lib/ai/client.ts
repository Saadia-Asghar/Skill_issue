import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Provider preference (in order):
 *   1. Google Gemini   — set GOOGLE_GENERATIVE_AI_API_KEY (FREE tier: 1500 req/day)
 *      Get a key in 30 seconds at https://aistudio.google.com/apikey
 *   2. Anthropic Claude — set ANTHROPIC_API_KEY (paid)
 *
 * The whole app only ever touches `explainModel` and `gauntletModel` exported
 * below — the rest of the codebase doesn't care which provider is in play.
 */

function isGeminiConfigured(): boolean {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return Boolean(key && key.length > 10 && key !== "REPLACE_ME");
}

function isAnthropicConfiguredInternal(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.startsWith("sk-ant-") && key !== "sk-ant-REPLACE_ME");
}

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Model used for streamed persona explanations. Sub-second TTFT is the goal —
 * Gemini 2.5 Flash and Claude Haiku 4.5 both deliver that.
 *
 * Override per-provider with:
 *   GOOGLE_EXPLAIN_MODEL=gemini-2.5-flash
 *   ANTHROPIC_EXPLAIN_MODEL=claude-haiku-4-5
 */
export const explainModel = isGeminiConfigured()
  ? google(process.env.GOOGLE_EXPLAIN_MODEL ?? "gemini-2.5-flash")
  : anthropic(process.env.ANTHROPIC_EXPLAIN_MODEL ?? "claude-haiku-4-5");

/**
 * Model used for Comprehension Gauntlet question generation. Needs strong
 * structured-output behavior. Gemini 2.5 Pro and Claude Sonnet 4.5 both
 * support JSON mode reliably.
 *
 * Override per-provider with:
 *   GOOGLE_GAUNTLET_MODEL=gemini-2.5-pro
 *   ANTHROPIC_GAUNTLET_MODEL=claude-sonnet-4-5
 */
export const gauntletModel = isGeminiConfigured()
  ? google(process.env.GOOGLE_GAUNTLET_MODEL ?? "gemini-2.5-pro")
  : anthropic(process.env.ANTHROPIC_GAUNTLET_MODEL ?? "claude-sonnet-4-5");

/**
 * True iff *any* supported LLM provider has a usable key configured.
 * Callers (route handlers) use this to fail fast with a 503 when neither
 * Gemini nor Anthropic is set up.
 *
 * Kept under the legacy name `isAnthropicConfigured` so the dozen+ existing
 * route handlers don't need to be touched.
 */
export function isAnthropicConfigured(): boolean {
  return isGeminiConfigured() || isAnthropicConfiguredInternal();
}

/** Which provider will actually serve requests. Useful for logging / health. */
export function activeLlmProvider(): "google" | "anthropic" | "none" {
  if (isGeminiConfigured()) return "google";
  if (isAnthropicConfiguredInternal()) return "anthropic";
  return "none";
}
