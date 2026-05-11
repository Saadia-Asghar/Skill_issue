import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

/**
 * Provider preference (in order):
 *
 *   1. Groq            — set GROQ_API_KEY            (FREE, ~14k req/day, no credit card, Llama 3.3 70B)
 *      https://console.groq.com/keys                  Easiest signup. No project, no Cloud Console.
 *   2. Google Gemini   — set GOOGLE_GENERATIVE_AI_API_KEY  (FREE, 1500 req/day on flash)
 *      https://aistudio.google.com/apikey
 *   3. Anthropic       — set ANTHROPIC_API_KEY       (paid)
 *      https://console.anthropic.com/settings/keys
 *
 * The whole app only ever touches `explainModel` and `gauntletModel` exported
 * below — the rest of the codebase doesn't care which provider is in play.
 */

function isConfiguredKey(key: string | undefined, prefix: string): boolean {
  return Boolean(
    key &&
      key.length > 10 &&
      key !== "REPLACE_ME" &&
      (prefix === "" || key.startsWith(prefix)) &&
      key !== `${prefix}REPLACE_ME`,
  );
}

function isGroqConfigured(): boolean {
  return isConfiguredKey(process.env.GROQ_API_KEY, "gsk_");
}

function isGeminiConfigured(): boolean {
  return isConfiguredKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY, "");
}

function isAnthropicConfiguredInternal(): boolean {
  return isConfiguredKey(process.env.ANTHROPIC_API_KEY, "sk-ant-");
}

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Model used for streamed persona explanations. Sub-second TTFT is the goal —
 * Groq's Llama 3.3 70B and Gemini 2.5 Flash both deliver that easily; Claude
 * Haiku 4.5 is the paid fallback.
 *
 * Override per-provider with:
 *   GROQ_EXPLAIN_MODEL=llama-3.3-70b-versatile
 *   GOOGLE_EXPLAIN_MODEL=gemini-2.5-flash
 *   ANTHROPIC_EXPLAIN_MODEL=claude-haiku-4-5
 */
export const explainModel = isGroqConfigured()
  ? groq(process.env.GROQ_EXPLAIN_MODEL ?? "llama-3.3-70b-versatile")
  : isGeminiConfigured()
    ? google(process.env.GOOGLE_EXPLAIN_MODEL ?? "gemini-2.5-flash")
    : anthropic(process.env.ANTHROPIC_EXPLAIN_MODEL ?? "claude-haiku-4-5");

/**
 * Model used for Comprehension Gauntlet question generation. Needs strong
 * structured-output (JSON-mode) behavior. Llama 3.3 70B, Gemini 2.5 Pro, and
 * Claude Sonnet 4.5 all support that reliably.
 *
 * Override per-provider with:
 *   GROQ_GAUNTLET_MODEL=llama-3.3-70b-versatile
 *   GOOGLE_GAUNTLET_MODEL=gemini-2.5-pro
 *   ANTHROPIC_GAUNTLET_MODEL=claude-sonnet-4-5
 */
export const gauntletModel = isGroqConfigured()
  ? groq(process.env.GROQ_GAUNTLET_MODEL ?? "llama-3.3-70b-versatile")
  : isGeminiConfigured()
    ? google(process.env.GOOGLE_GAUNTLET_MODEL ?? "gemini-2.5-pro")
    : anthropic(process.env.ANTHROPIC_GAUNTLET_MODEL ?? "claude-sonnet-4-5");

/**
 * True iff *any* supported LLM provider has a usable key configured.
 * Callers (route handlers) use this to fail fast with a 503 when no provider
 * is set up.
 *
 * Kept under the legacy name `isAnthropicConfigured` so the dozen+ existing
 * route handlers don't need to be touched.
 */
export function isAnthropicConfigured(): boolean {
  return isGroqConfigured() || isGeminiConfigured() || isAnthropicConfiguredInternal();
}

/** Which provider will actually serve requests. Useful for logging / health. */
export function activeLlmProvider(): "groq" | "google" | "anthropic" | "none" {
  if (isGroqConfigured()) return "groq";
  if (isGeminiConfigured()) return "google";
  if (isAnthropicConfiguredInternal()) return "anthropic";
  return "none";
}
