import type { Queryable } from "./client";
import { fromTs, toTs } from "./time";

// When each map tile's places were last fetched from Overpass. Shared by every user.

/** Fetch times (epoch ms) for the tiles that have one. */
export async function tileTimes(q: Queryable, tiles: readonly string[]): Promise<Map<string, number>> {
  if (tiles.length === 0) return new Map();
  const rows = await q.query<{ tile: string; fetched_at: unknown }>("SELECT tile, fetched_at FROM osm_tiles WHERE tile = ANY($1::text[])", [tiles]);
  return new Map(rows.map((r) => [r.tile, fromTs(r.fetched_at)]));
}

/** Records the tiles as fetched at `now`. */
export async function markTiles(q: Queryable, tiles: readonly string[], now: number): Promise<void> {
  if (tiles.length === 0) return;
  await q.query(
    `INSERT INTO osm_tiles (tile, fetched_at) SELECT t, $2 FROM unnest($1::text[]) AS t
     ON CONFLICT (tile) DO UPDATE SET fetched_at = EXCLUDED.fetched_at`,
    [[...new Set(tiles)], toTs(now)],
  );
}
