import type { Queryable } from "./client";
import { fromTs, toTs } from "./time";

// When each map tile's places were last fetched from Overpass, and when a
// background refill last claimed it. Shared by every user.

/** Fetch times (epoch ms) for the tiles that have been fetched. */
export async function tileTimes(q: Queryable, tiles: readonly string[]): Promise<Map<string, number>> {
  if (tiles.length === 0) return new Map();
  const rows = await q.query<{ tile: string; fetched_at: unknown }>(
    "SELECT tile, fetched_at FROM osm_tiles WHERE tile = ANY($1::text[]) AND fetched_at IS NOT NULL",
    [tiles],
  );
  return new Map(rows.map((r) => [r.tile, fromTs(r.fetched_at)]));
}

/** Records the tiles as fetched at `now` and releases their claim. */
export async function markTiles(q: Queryable, tiles: readonly string[], now: number): Promise<void> {
  if (tiles.length === 0) return;
  await q.query(
    `INSERT INTO osm_tiles (tile, fetched_at) SELECT t, $2 FROM unnest($1::text[]) AS t
     ON CONFLICT (tile) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, claimed_at = NULL`,
    [[...new Set(tiles)], toTs(now)],
  );
}

/**
 * Claims tiles for a refill, atomically: a tile is claimed unless another
 * claim is younger than claimTtlMs or it was fetched after staleBefore.
 * Returns the tiles this caller now holds.
 */
export async function claimTiles(q: Queryable, tiles: readonly string[], now: number, claimTtlMs: number, staleBefore: number): Promise<string[]> {
  if (tiles.length === 0) return [];
  const rows = await q.query<{ tile: string }>(
    `INSERT INTO osm_tiles (tile, claimed_at) SELECT t, $2 FROM unnest($1::text[]) AS t
     ON CONFLICT (tile) DO UPDATE SET claimed_at = EXCLUDED.claimed_at
     WHERE (osm_tiles.claimed_at IS NULL OR osm_tiles.claimed_at <= $3)
       AND (osm_tiles.fetched_at IS NULL OR osm_tiles.fetched_at <= $4)
     RETURNING tile`,
    [[...new Set(tiles)], toTs(now), toTs(now - claimTtlMs), toTs(staleBefore)],
  );
  return rows.map((r) => r.tile);
}
