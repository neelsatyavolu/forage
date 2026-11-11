import type { z } from "zod";
import { AiError } from "./errors";

// Turning a model's text into validated JSON. Pure: the model call is passed
// in, so this is tested without a network.

/** The outermost JSON object or array in the text (models sometimes wrap it in prose or a code fence). */
export function extractJson(text: string): unknown {
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) throw new SyntaxError("The model did not return JSON.");
  const start = Math.min(...starts);
  const end = text.lastIndexOf(text[start] === "{" ? "}" : "]");
  if (end <= start) throw new SyntaxError("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

/** Why the text failed, in words the model can act on, or null when it is valid. */
function problemWith<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; problem: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false, problem: "it was not valid JSON" };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, problem: `${issue?.path.join(".") || "the root"}: ${issue?.message ?? "does not match the schema"}` };
}

export const JSON_RULE = "Reply with one JSON value only: no prose, no code fence.";

/**
 * Asks for JSON matching `schema`. A reply that does not parse or validate
 * gets one retry with the problem stated; a second bad reply throws AiError("bad_output").
 */
export async function completeJson<T>(
  call: (system: string, prompt: string) => Promise<string>,
  req: { system: string; prompt: string; schema: z.ZodType<T> },
): Promise<T> {
  const system = `${req.system}\n\n${JSON_RULE}`;
  const first = problemWith(await call(system, req.prompt), req.schema);
  if (first.ok) return first.value;
  const retry = `${req.prompt}\n\nYour previous reply could not be used because ${first.problem}. ${JSON_RULE}`;
  const second = problemWith(await call(system, retry), req.schema);
  if (second.ok) return second.value;
  throw new AiError("bad_output", "The AI's answer didn't make sense. Try again.");
}
