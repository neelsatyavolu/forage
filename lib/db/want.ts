import type { WantItem, WantSource } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

const rowToWant = (r: Row): WantItem => ({
  userId: r.user_id as string,
  placeId: r.place_id as string,
  addedAt: fromTs(r.added_at),
  source: r.source as WantSource,
});

/** Adds a place to the user's want list. Adding it again keeps the first entry. */
export async function addWant(q: Queryable, userId: string, placeId: string, source: WantSource, now: number): Promise<WantItem> {
  await q.query(
    "INSERT INTO want_list (user_id, place_id, added_at, source) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, place_id) DO NOTHING",
    [userId, placeId, toTs(now), source],
  );
  const [row] = await q.query("SELECT * FROM want_list WHERE user_id = $1 AND place_id = $2", [userId, placeId]);
  return rowToWant(row);
}

export async function removeWant(q: Queryable, userId: string, placeId: string): Promise<boolean> {
  return (await q.query("DELETE FROM want_list WHERE user_id = $1 AND place_id = $2 RETURNING place_id", [userId, placeId])).length === 1;
}

/** The user's want list, newest first. */
export async function listWant(q: Queryable, userId: string): Promise<WantItem[]> {
  return (await q.query("SELECT * FROM want_list WHERE user_id = $1 ORDER BY added_at DESC", [userId])).map(rowToWant);
}

export async function isWanted(q: Queryable, userId: string, placeId: string): Promise<boolean> {
  return (await q.query("SELECT 1 FROM want_list WHERE user_id = $1 AND place_id = $2", [userId, placeId])).length === 1;
}
