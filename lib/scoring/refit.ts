import type { Queryable } from "../db/client";
import { deleteScore, listComparisons, listScores, saveScores } from "../db/scores";
import { listVisits } from "../db/visits";
import type { Occasion, Reaction } from "../types";
import { fitScores } from "./bradley-terry";
import { MAX_COMPARISONS, pickOpponent } from "./pick";

// Ties the fit to the database: one user's places in one occasion, each in
// the band of its latest visit, refitted from every comparison they answered.

export { MAX_COMPARISONS };

type Band = { reaction: Reaction; rating: number | null };

/** Each place the user logged for the occasion, with the reaction and rating of its latest visit. */
async function bands(q: Queryable, userId: string, occasion: Occasion): Promise<Map<string, Band>> {
  const visits = await listVisits(q, userId, { occasion });
  // Newest first, so the first visit seen for a place is its latest.
  const out = new Map<string, Band>();
  for (const v of visits) if (!out.has(v.placeId)) out.set(v.placeId, { reaction: v.reaction, rating: v.rating });
  return out;
}

/** Refits the occasion's scores and saves them; places no longer logged lose their score. */
export async function refitOccasion(q: Queryable, userId: string, occasion: Occasion, now: number): Promise<Map<string, number>> {
  const band = await bands(q, userId, occasion);
  const comparisons = await listComparisons(q, userId, occasion);
  const scores = fitScores([...band].map(([id, b]) => ({ id, ...b })), comparisons);
  await saveScores(q, userId, occasion, [...scores].map(([placeId, score]) => ({ placeId, score })), now);
  for (const stale of await listScores(q, userId, occasion)) {
    if (!scores.has(stale.placeId)) await deleteScore(q, userId, stale.placeId, occasion);
  }
  return scores;
}

/** The place to compare `placeId` with next in this occasion, or null when there is no useful one. */
export async function nextOpponent(q: Queryable, userId: string, placeId: string, occasion: Occasion): Promise<string | null> {
  const band = await bands(q, userId, occasion);
  const reaction = band.get(placeId)?.reaction;
  if (!reaction) return null;
  const scores = new Map((await listScores(q, userId, occasion)).map((s) => [s.placeId, s.score]));
  const asked = new Set(
    (await listComparisons(q, userId, occasion))
      .filter((c) => c.winnerPlaceId === placeId || c.loserPlaceId === placeId)
      .map((c) => (c.winnerPlaceId === placeId ? c.loserPlaceId : c.winnerPlaceId)),
  );
  const candidates = [...band].map(([id, b]) => ({ id, reaction: b.reaction, score: scores.get(id) ?? 0 }));
  return pickOpponent({ id: placeId, reaction, score: scores.get(placeId) ?? 0 }, candidates, asked);
}
