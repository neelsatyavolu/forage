import type { Queryable } from "../db/client";
import { getPlace } from "../db/places";
import { getScore, insertComparison } from "../db/scores";
import { deleteVisit, getVisit, insertVisit, listVisits, updateVisit } from "../db/visits";
import { HttpError } from "../api";
import type { ComparisonInput, Occasion, Place, Visit, VisitInput, VisitPatch } from "../types";
import { MAX_COMPARISONS, nextOpponent, refitOccasion } from "./refit";

// The logging flow: save a visit, refit its occasion, and offer at most
// MAX_COMPARISONS "which did you like more?" questions against places in the
// same occasion. Every write refits the occasions it touched.

export type Step = { score: number | null; opponent: Place | null; asked: number };

async function step(q: Queryable, userId: string, placeId: string, occasion: Occasion, asked: number): Promise<Step> {
  const score = (await getScore(q, userId, placeId, occasion))?.score ?? null;
  const opponentId = asked < MAX_COMPARISONS ? await nextOpponent(q, userId, placeId, occasion) : null;
  return { score, opponent: opponentId ? await getPlace(q, opponentId) : null, asked };
}

export async function logVisit(q: Queryable, userId: string, input: VisitInput, now: number): Promise<{ visit: Visit } & Step> {
  if (!(await getPlace(q, input.placeId))) throw new HttpError("That place wasn't found.", 404);
  const visit = await insertVisit(q, userId, input, now);
  await refitOccasion(q, userId, input.occasion, now);
  return { visit, ...(await step(q, userId, input.placeId, input.occasion, 0)) };
}

/** Both places must be logged in the occasion, so a comparison always has two fitted sides. */
async function loggedIn(q: Queryable, userId: string, placeId: string, occasion: Occasion): Promise<boolean> {
  return (await listVisits(q, userId, { placeId, occasion, limit: 1 })).length > 0;
}

/**
 * Saves an answer and refits. With `subjectPlaceId` (the place just logged)
 * and how many questions were answered so far, also returns the next one.
 */
export async function answerComparison(
  q: Queryable,
  userId: string,
  input: ComparisonInput,
  next: { subjectPlaceId: string; asked: number } | null,
  now: number,
): Promise<Step> {
  const both = await Promise.all([loggedIn(q, userId, input.winnerPlaceId, input.occasion), loggedIn(q, userId, input.loserPlaceId, input.occasion)]);
  if (!both.every(Boolean)) throw new HttpError("Log both places for this occasion before comparing them.", 400);
  await insertComparison(q, userId, input, now);
  await refitOccasion(q, userId, input.occasion, now);
  if (!next) return { score: null, opponent: null, asked: MAX_COMPARISONS };
  return step(q, userId, next.subjectPlaceId, input.occasion, next.asked);
}

export async function editVisit(q: Queryable, userId: string, id: string, patch: VisitPatch, now: number): Promise<Visit> {
  const before = await getVisit(q, userId, id);
  if (!before) throw new HttpError("That visit wasn't found.", 404);
  const after = await updateVisit(q, userId, id, patch);
  if (!after) throw new HttpError("That visit wasn't found.", 404);
  for (const occasion of new Set([before.occasion, after.occasion])) await refitOccasion(q, userId, occasion, now);
  return after;
}

export async function removeVisit(q: Queryable, userId: string, id: string, now: number): Promise<void> {
  const visit = await getVisit(q, userId, id);
  if (!visit || !(await deleteVisit(q, userId, id))) throw new HttpError("That visit wasn't found.", 404);
  await refitOccasion(q, userId, visit.occasion, now);
}
