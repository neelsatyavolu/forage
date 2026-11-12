import type { Queryable } from "../db/client";
import { isGuest } from "../db/users";
import { FIRST_PICKS_AT, RATE_GOAL, type Progress } from "../types";

// How far the user is toward picks: distinct places with at least one visit, across occasions.

/** A guest with this many rated places must save an account before rating more. */
export const GUEST_RATED_CAP = 200;

export async function ratedCount(q: Queryable, userId: string): Promise<number> {
  const [row] = await q.query<{ n: number | string }>("SELECT count(DISTINCT place_id) AS n FROM visits WHERE user_id = $1", [userId]);
  return Number(row?.n ?? 0);
}

export const progressOf = (rated: number): Progress => ({ rated, firstPicksAt: FIRST_PICKS_AT, goal: RATE_GOAL });

/** Progress for a user, or 0 rated with no user. */
export async function progressFor(q: Queryable, userId: string | null): Promise<Progress> {
  return progressOf(userId ? await ratedCount(q, userId) : 0);
}

/** True when a guest has rated GUEST_RATED_CAP places and this visit would add a new one. */
export async function guestAtCap(q: Queryable, userId: string, placeId: string): Promise<boolean> {
  if (!(await isGuest(q, userId))) return false;
  const [seen] = await q.query("SELECT 1 FROM visits WHERE user_id = $1 AND place_id = $2 LIMIT 1", [userId, placeId]);
  return !seen && (await ratedCount(q, userId)) >= GUEST_RATED_CAP;
}
