import "server-only";
import { aiStatus, complete, type Owner } from "../ai";
import { getDb } from "../db/client";
import { nearbyPlaces } from "../places";
import type { AskAi } from "../taste/ai";
import type { Rec, RecContext } from "../types";
import { recommendWith, type RecOptions } from "./engine";

// Recommendations, owned by the taste-engine track: candidates from
// lib/places, fast scoring from the user's visits, scores and taste profile,
// then an optional AI rerank (lib/ai complete) that may only cite candidates
// by id. Without an AI connection it returns the plain scoring, with no reasons.

export type { RecOptions } from "./engine";
export type { RecFilter } from "./rank";

/** The user's connected AI as an AskAi, or null. Call from route handlers only (complete may write cookies). */
export async function userAi(userId: string): Promise<AskAi | null> {
  const owner: Owner = { kind: "user", id: userId };
  const status = await aiStatus(owner);
  if (!status.codex && !status.grok) return null;
  return (req) => complete(owner, { ...req, speed: "fast" });
}

/** Ranked recommendations for the user in this context, best first. */
export async function recommend(userId: string, ctx: RecContext, opts: RecOptions = {}): Promise<Rec[]> {
  return recommendWith({ db: await getDb(), nearby: nearbyPlaces, ai: await userAi(userId), now: Date.now() }, userId, ctx, opts);
}
