import "server-only";
import type { z } from "zod";
import { allow } from "../server/limits";
import { callModel, ModelError } from "./complete";
import { AiError } from "./errors";
import { completeJson } from "./json";
import { resolveModel } from "./models";
import type { Provider, Tokens } from "./providers";
import { aiOwner, getActiveSession, hasSession, type Owner } from "./session";

// The one way feature code talks to AI: complete(owner, {system, prompt, schema})
// gives back JSON already validated by the schema, on the user's own ChatGPT or
// Grok subscription. Call it from route handlers or server actions (it may
// refresh tokens, which writes cookies).

export { AiError } from "./errors";
export type { AiErrorCode } from "./errors";
export { aiOwner };
export type { Owner, Provider };

export const PROVIDER_NAME: Record<Provider, string> = { codex: "ChatGPT", grok: "Grok" };
const PROVIDERS: Provider[] = ["codex", "grok"];

export type CompleteRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Which subscription to use. Default: ChatGPT when connected, else Grok. */
  provider?: Provider;
  /** "fast" picks the catalog's fast tier (reranks, short answers); "main" the default model. */
  speed?: "fast" | "main";
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

/** Which providers the owner has connected. */
export async function aiStatus(owner: Owner): Promise<Record<Provider, boolean>> {
  const [codex, grok] = await Promise.all(PROVIDERS.map((p) => hasSession(p, owner)));
  return { codex, grok };
}

async function tokensFor(owner: Owner, wanted?: Provider): Promise<{ provider: Provider; tokens: Tokens }> {
  for (const provider of wanted ? [wanted] : PROVIDERS) {
    const tokens = await getActiveSession(provider, owner);
    if (tokens) return { provider, tokens };
  }
  const name = wanted ? PROVIDER_NAME[wanted] : "ChatGPT or Grok";
  throw new AiError("not_connected", `Connect your ${name} account first.`);
}

/**
 * Asks the owner's connected AI and returns its answer parsed by `schema`.
 * Throws AiError: not_connected (401), rate_limited (429), bad_output or upstream (502).
 * handle() in lib/api turns these into JSON responses.
 */
export async function complete<T>(owner: Owner, req: CompleteRequest<T>): Promise<T> {
  if (!(await allow("ai", `${owner.kind}:${owner.id}`))) throw new AiError("rate_limited", "Too many AI requests. Wait a few minutes.");
  const { provider, tokens } = await tokensFor(owner, req.provider);
  const model = await resolveModel(provider, undefined, req.speed ?? "main");
  const call = async (system: string, user: string) => {
    try {
      return await callModel({ provider, tokens, model, system, user, effort: req.effort ?? "low", signal: req.signal });
    } catch (err) {
      if (err instanceof ModelError) throw new AiError("upstream", err.message);
      if (req.signal?.aborted) throw err;
      console.error(`[ai] ${provider} call failed:`, err instanceof Error ? err.message : err);
      throw new AiError("upstream", "Couldn't reach the AI. Try again.");
    }
  };
  return completeJson(call, req);
}
