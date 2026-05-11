import "server-only";

import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

import { textJsonModel } from "./client";

/**
 * Robust structured-output generator.
 *
 * `generateObject` uses the provider's native strict JSON-Schema mode. That
 * works great on Anthropic + Gemini, but Groq's `openai/gpt-oss-120b`
 * frequently rejects valid schemas with:
 *
 *   { code: "json_validate_failed", failed_generation: "" }
 *
 * The empty `failed_generation` makes it impossible to recover — the request
 * never even produced text. Schemas with `min`/`max` length constraints or
 * nested arrays are the worst offenders.
 *
 * Fallback strategy:
 *   1. Strict mode on the requested model (fast path).
 *   2. If schema validation fails, retry with `generateText` against
 *      {@link textJsonModel} — a separate, instruction-following model that
 *      reliably emits text (Groq's reasoning models like `gpt-oss-120b`
 *      route their output through a hidden reasoning channel, so calling
 *      `generateText` against them returns empty strings).
 *   3. Extract the first balanced JSON object from the response and validate
 *      with Zod.
 */
export async function safeGenerateObject<T>(opts: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  const { model, schema, system, prompt, temperature = 0.7 } = opts;

  try {
    const { object } = await generateObject({
      model,
      schema,
      system,
      prompt,
      temperature,
    });
    return object;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSchemaFailure =
      message.includes("json_validate_failed") ||
      message.includes("Failed to validate JSON") ||
      message.includes("response_format") ||
      message.includes("json_schema") ||
      message.includes("response_format.json_schema");

    if (!isSchemaFailure) throw err;

    console.warn(
      "[safeGenerateObject] strict-schema mode failed, falling back to text-mode JSON parse",
    );

    const { text } = await generateText({
      model: textJsonModel,
      system: `${system}

OUTPUT FORMAT (CRITICAL):
- Respond with ONE valid JSON object and NOTHING else.
- No prose, no markdown fences, no commentary, no leading/trailing text.
- Match the JSON SHAPE described above exactly.
- Strings must be valid JSON strings (escape backslashes, quotes, newlines).`,
      prompt,
      temperature,
    });

    if (!text || text.trim().length === 0) {
      throw new Error(
        "Text-mode fallback returned empty output. Original strict-mode error: " +
          message,
      );
    }

    const json = extractJson(text);
    if (!json) {
      const preview = text.slice(0, 240).replace(/\s+/g, " ");
      throw new Error(
        `Text-mode fallback returned non-JSON output (preview: "${preview}"). ` +
          `Original strict-mode error: ${message}`,
      );
    }
    return schema.parse(json);
  }
}

/**
 * Extract the first valid JSON object from a free-form model response.
 * Tries: raw parse → strip ```json fences → first {...} balanced block.
 */
function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Scan for the first balanced { ... } block.
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
