import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

// "Not been" answers from the rating deck. A skip keeps the place out of the
// deck for SKIP_TTL_MS; logging a visit there deletes it.

export const SKIP_TTL_MS = 180 * 24 * 60 * 60_000;

export type Skip = { placeId: string; createdAt: number };

const rowToSkip = (r: Row): Skip => ({ placeId: r.place_id as string, createdAt: fromTs(r.created_at) });

/** Records a skip. Skipping twice keeps the first. */
export async function addSkip(q: Queryable, userId: string, placeId: string, now: number): Promise<Skip> {
  await q.query(
    "INSERT INTO place_skips (user_id, place_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, place_id) DO NOTHING",
    [userId, placeId, toTs(now)],
  );
  const [row] = await q.query("SELECT place_id, created_at FROM place_skips WHERE user_id = $1 AND place_id = $2", [userId, placeId]);
  return rowToSkip(row);
}

export async function removeSkip(q: Queryable, userId: string, placeId: string): Promise<boolean> {
  return (await q.query("DELETE FROM place_skips WHERE user_id = $1 AND place_id = $2 RETURNING place_id", [userId, placeId])).length === 1;
}

/** Places the user skipped within SKIP_TTL_MS of `now`. */
export async function recentSkips(q: Queryable, userId: string, now: number): Promise<Set<string>> {
  const rows = await q.query<{ place_id: string }>("SELECT place_id FROM place_skips WHERE user_id = $1 AND created_at > $2", [
    userId,
    toTs(now - SKIP_TTL_MS),
  ]);
  return new Set(rows.map((r) => r.place_id));
}
