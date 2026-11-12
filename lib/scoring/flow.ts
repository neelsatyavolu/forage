import type { Queryable } from "../db/client";
import { getPlace } from "../db/places";
import { deleteComparison, getScore, insertComparison } from "../db/scores";
import { removeSkip } from "../db/skips";
import { deleteVisit, getVisit, insertVisit, listVisits, updateVisit } from "../db/visits";
import { HttpError } from "../api";
import { RATING_BAND_MESSAGE, ratingInBand, type ComparisonInput, type Occasion, type Place, type Visit, type VisitInput, type VisitPatch } from "../types";
import { MAX_COMPARISONS, nextOpponent, refitOccasion } from "./refit";

// The logging flow: save a visit, refit its occasion, and offer at most
// MAX_COMPARISONS "which did you like more?" questions against places in the
// same occasion. Every write refits the occasions it touched.

export type Step = { score: number | null; opponent: Place | null; asked: number };

const scoreOf = async (q: Queryable, userId: string, placeId: string, occasion: Occasion) => (await getScore(q, userId, placeId, occasion))?.score ?? null;

/** The place's score now and the next opponent, or none once `asked` reaches MAX_COMPARISONS. */
export async function step(q: Queryable, userId: string, placeId: string, occasion: Occasion, asked: number): Promise<Step> {
  const score = await scoreOf(q, userId, placeId, occasion);
  const opponentId = asked < MAX_COMPARISONS ? await nextOpponent(q, userId, placeId, occasion) : null;
  return { score, opponent: opponentId ? await getPlace(q, opponentId) : null, asked };
}

/** Saves a visit (and forgets a "Not been" for the place), refits, and offers the first comparison. */
export async function logVisit(q: Queryable, userId: string, input: VisitInput, now: number): Promise<{ visit: Visit } & Step> {
  if (!ratingInBand(input)) throw new HttpError(RATING_BAND_MESSAGE, 400);
  if (!(await getPlace(q, input.placeId))) throw new HttpError("That place wasn't found.", 404);
  const visit = await insertVisit(q, userId, input, now);
  await removeSkip(q, userId, input.placeId);
  await refitOccasion(q, userId, input.occasion, now);
  return { visit, ...(await step(q, userId, input.placeId, input.occasion, 0)) };
}

/** Both places must be logged in the occasion, so a comparison always has two fitted sides. */
async function loggedIn(q: Queryable, userId: string, placeId: string, occasion: Occasion): Promise<boolean> {
  return (await listVisits(q, userId, { placeId, occasion, limit: 1 })).length > 0;
}

/**
 * Saves an answer and refits. With `subjectPlaceId` (the place just logged)
 * and how many questions were answered so far, also returns the subject's
 * score and the next question. The answer's id lets the client undo it.
 */
export async function answerComparison(
  q: Queryable,
  userId: string,
  input: ComparisonInput,
  next: { subjectPlaceId: string; asked: number } | null,
  now: number,
): Promise<Step & { id: number; subjectScore: number | null }> {
  const both = await Promise.all([loggedIn(q, userId, input.winnerPlaceId, input.occasion), loggedIn(q, userId, input.loserPlaceId, input.occasion)]);
  if (!both.every(Boolean)) throw new HttpError("Log both places for this occasion before comparing them.", 400);
  const saved = await insertComparison(q, userId, input, now);
  await refitOccasion(q, userId, input.occasion, now);
  if (!next) return { id: saved.id, score: null, subjectScore: null, opponent: null, asked: MAX_COMPARISONS };
  const s = await step(q, userId, next.subjectPlaceId, input.occasion, next.asked);
  return { id: saved.id, ...s, subjectScore: s.score };
}

/** Takes back one of the user's answers and refits. The given place's score afterwards (null without one). */
export async function undoComparison(q: Queryable, userId: string, id: number, placeId: string | null, now: number): Promise<{ score: number | null }> {
  const removed = await deleteComparison(q, userId, id);
  if (!removed) throw new HttpError("That comparison wasn't found.", 404);
  await refitOccasion(q, userId, removed.occasion, now);
  return { score: placeId ? await scoreOf(q, userId, placeId, removed.occasion) : null };
}

/** Changes a visit, refits the occasions it was and is in, and returns the place's score in its occasion now. */
export async function editVisit(q: Queryable, userId: string, id: string, patch: VisitPatch, now: number): Promise<{ visit: Visit; score: number | null }> {
  const before = await getVisit(q, userId, id);
  if (!before) throw new HttpError("That visit wasn't found.", 404);
  const merged = { reaction: patch.reaction ?? before.reaction, rating: patch.rating === undefined ? before.rating : patch.rating };
  if (!ratingInBand(merged)) throw new HttpError(RATING_BAND_MESSAGE, 400);
  const after = await updateVisit(q, userId, id, patch);
  if (!after) throw new HttpError("That visit wasn't found.", 404);
  for (const occasion of new Set([before.occasion, after.occasion])) await refitOccasion(q, userId, occasion, now);
  return { visit: after, score: await scoreOf(q, userId, after.placeId, after.occasion) };
}

export async function removeVisit(q: Queryable, userId: string, id: string, now: number): Promise<void> {
  const visit = await getVisit(q, userId, id);
  if (!visit || !(await deleteVisit(q, userId, id))) throw new HttpError("That visit wasn't found.", 404);
  await refitOccasion(q, userId, visit.occasion, now);
}
