import type { Queryable } from "../db/client";
import { recentSkips } from "../db/skips";

// What the deck reads from the database: the user's own places to leave out,
// and how many Forage users logged each candidate.

/** Places the user has rated, wants to try, or skipped recently. Empty with no user. */
export async function deckExclusions(q: Queryable, userId: string | null, now: number): Promise<Set<string>> {
  if (!userId) return new Set();
  const [rated, wanted, skipped] = await Promise.all([
    q.query<{ place_id: string }>("SELECT DISTINCT place_id FROM visits WHERE user_id = $1", [userId]),
    q.query<{ place_id: string }>("SELECT place_id FROM want_list WHERE user_id = $1", [userId]),
    recentSkips(q, userId, now),
  ]);
  return new Set([...rated.map((r) => r.place_id), ...wanted.map((r) => r.place_id), ...skipped]);
}

/** Distinct users with a visit at each place, only where that is at least `min`. */
export async function crowdCounts(q: Queryable, placeIds: readonly string[], min: number): Promise<Map<string, number>> {
  if (placeIds.length === 0) return new Map();
  const rows = await q.query<{ place_id: string; n: number | string }>(
    `SELECT place_id, count(DISTINCT user_id) AS n FROM visits WHERE place_id = ANY($1::uuid[])
     GROUP BY place_id HAVING count(DISTINCT user_id) >= $2`,
    [placeIds, min],
  );
  return new Map(rows.map((r) => [r.place_id, Number(r.n)]));
}
