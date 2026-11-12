import type { Queryable } from "../../lib/db/client";
import { markTiles } from "../../lib/db/osm-tiles";
import { getPlacesBySource, upsertPlacesBatch } from "../../lib/db/places";
import { mergeInput } from "../../lib/places/merge";
import { tilesAround } from "../../lib/places/tiles";
import type { Place, PlaceInput } from "../../lib/types";

// The database side of the import. Imported places are merged into what's
// stored exactly like an Overpass refill (lib/places/store saveFetched), but a
// place whose stored row wouldn't change isn't written again: rewriting every
// row each month would leave a dead copy of each one, which counts against
// the database's storage limit.

/** Rows per lookup and upsert statement. */
export const BATCH = 500;
/** Tiles per osm_tiles statement. */
const TILE_CHUNK = 5_000;
/** Places looked at per page when pruning. */
const PRUNE_PAGE = 10_000;

/** The nearby-search tile (lib/places/tiles) a point falls in. */
export const tileOf = (p: { lat: number; lng: number }): string => tilesAround(p, 0)[0];

/** JSON with object keys sorted, so stored jsonb (which reorders keys) compares equal to the input. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** True when writing `input` over `stored` would change nothing but updated_at. */
export function unchanged(stored: Place, input: PlaceInput): boolean {
  return (
    stored.name === input.name && stored.lat === input.lat && stored.lng === input.lng && stored.address === input.address &&
    stored.city === input.city && stored.country === input.country && stored.googlePlaceId === input.googlePlaceId &&
    stored.priceLevel === input.priceLevel && stable(stored.cuisine) === stable(input.cuisine) && stable(stored.tags) === stable(input.tags)
  );
}

export type SaveCounts = { inserted: number; updated: number; unchanged: number };

/** Upserts one batch (distinct source ids), skipping places that wouldn't change. */
export async function saveBatch(q: Queryable, inputs: readonly PlaceInput[], now: number): Promise<SaveCounts> {
  const existing = new Map((await getPlacesBySource(q, "osm", inputs.map((p) => p.sourceId))).map((p) => [p.sourceId, p]));
  const writes = inputs
    .map((p) => ({ stored: existing.get(p.sourceId) ?? null, merged: mergeInput(existing.get(p.sourceId) ?? null, p) }))
    .filter(({ stored, merged }) => !stored || !unchanged(stored, merged));
  await upsertPlacesBatch(q, writes.map((w) => w.merged), now);
  const inserted = writes.filter((w) => !w.stored).length;
  return { inserted, updated: writes.length - inserted, unchanged: inputs.length - writes.length };
}

/** Marks tiles as fetched now, so nearby search serves them from the database. */
export async function markImported(q: Queryable, tiles: Iterable<string>, now: number): Promise<number> {
  const all = [...new Set(tiles)];
  for (let i = 0; i < all.length; i += TILE_CHUNK) await markTiles(q, all.slice(i, i + TILE_CHUNK), now);
  return all.length;
}

/** Every (table, column) with a foreign key to places, read from the catalog so new user tables are covered too. */
export async function placeReferences(q: Queryable): Promise<{ table: string; column: string }[]> {
  return q.query<{ table: string; column: string }>(
    `SELECT quote_ident(cl.relname) AS "table", quote_ident(a.attname) AS "column"
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = 'places'::regclass
     ORDER BY 1, 2`,
  );
}

/**
 * Deletes OSM places inside `tiles` whose source id isn't in `seen` (gone
 * from OpenStreetMap, or no longer a named place to eat or drink), unless any
 * user row refers to them. Returns how many were deleted.
 */
export async function pruneMissing(q: Queryable, tiles: ReadonlySet<string>, seen: ReadonlySet<string>): Promise<number> {
  const refs = await placeReferences(q);
  // visits, want_list, place_scores, ... always exist; finding none means the catalog query broke, so delete nothing.
  if (refs.length === 0) throw new Error("No tables refer to places; refusing to prune.");
  const unused = refs.map((r) => `NOT EXISTS (SELECT 1 FROM ${r.table} WHERE ${r.table}.${r.column} = places.id)`).join(" AND ");
  let deleted = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const page = await q.query<{ id: string; source_id: string; lat: number; lng: number }>(
      "SELECT id, source_id, lat, lng FROM places WHERE source = 'osm' AND id > $1 ORDER BY id LIMIT $2",
      [after, PRUNE_PAGE],
    );
    if (page.length === 0) return deleted;
    after = page[page.length - 1].id;
    const gone = page.filter((p) => !seen.has(p.source_id) && tiles.has(tileOf({ lat: Number(p.lat), lng: Number(p.lng) }))).map((p) => p.id);
    if (gone.length === 0) continue;
    const rows = await q.query(`DELETE FROM places WHERE id = ANY($1::uuid[]) AND source = 'osm' AND ${unused} RETURNING id`, [gone]);
    deleted += rows.length;
  }
}
