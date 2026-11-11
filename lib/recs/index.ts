import "server-only";
import type { Rec, RecContext } from "../types";

// Recommendations, owned by the taste-engine track: candidates from
// lib/places, fast scoring from the user's visits, scores and taste profile,
// then an optional AI rerank (lib/ai complete) that may only cite candidates
// by id. Without an AI connection it returns the plain scoring, with no reasons.

/** Ranked recommendations for the user in this context, best first. */
export async function recommend(userId: string, ctx: RecContext): Promise<Rec[]> {
  void userId;
  void ctx;
  throw new Error("not implemented");
}
