import { randomUUID } from "node:crypto";
import type { Place, PlaceInput, PlaceTags } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

// Places are shared by every user: one row per (source, source_id).

const rowToPlace = (r: Row): Place => ({
  id: r.id as string,
  source: r.source as Place["source"],
  sourceId: r.source_id as string,
  googlePlaceId: (r.google_place_id as string | null) ?? null,
  name: r.name as string,
  lat: Number(r.lat),
  lng: Number(r.lng),
  address: (r.address as string | null) ?? null,
  city: (r.city as string | null) ?? null,
  country: (r.country as string | null) ?? null,
  cuisine: (r.cuisine as string[] | null) ?? [],
  priceLevel: r.price_level === null || r.price_level === undefined ? null : Number(r.price_level),
  tags: (r.tags as PlaceTags | null) ?? {},
  updatedAt: fromTs(r.updated_at),
});

const params = (p: PlaceInput) => [
  p.source, p.sourceId, p.googlePlaceId, p.name, p.lat, p.lng, p.address, p.city, p.country, p.cuisine, p.priceLevel, JSON.stringify(p.tags),
];

/**
 * Inserts a place or refreshes the one with the same (source, sourceId).
 * A refresh keeps an existing Google place id when the new data has none.
 */
export async function upsertPlace(q: Queryable, input: PlaceInput, now: number): Promise<Place> {
  const [row] = await q.query(
    `INSERT INTO places (id, source, source_id, google_place_id, name, lat, lng, address, city, country, cuisine, price_level, tags, updated_at)
     VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $14)
     ON CONFLICT (source, source_id) DO UPDATE SET
       google_place_id = COALESCE(EXCLUDED.google_place_id, places.google_place_id),
       name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, address = EXCLUDED.address,
       city = EXCLUDED.city, country = EXCLUDED.country, cuisine = EXCLUDED.cuisine,
       price_level = EXCLUDED.price_level, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [...params(input), randomUUID(), toTs(now)],
  );
  return rowToPlace(row);
}

/** Upserts places one by one; the result is in input order. Wrap in db.transaction for all-or-nothing. */
export async function upsertPlaces(q: Queryable, inputs: readonly PlaceInput[], now: number): Promise<Place[]> {
  const out: Place[] = [];
  for (const input of inputs) out.push(await upsertPlace(q, input, now));
  return out;
}

export async function getPlace(q: Queryable, id: string): Promise<Place | null> {
  const [row] = await q.query("SELECT * FROM places WHERE id = $1", [id]);
  return row ? rowToPlace(row) : null;
}

export async function getPlaces(q: Queryable, ids: readonly string[]): Promise<Place[]> {
  if (ids.length === 0) return [];
  const rows = await q.query("SELECT * FROM places WHERE id = ANY($1::uuid[])", [ids]);
  return rows.map(rowToPlace);
}

export async function getPlaceBySource(q: Queryable, source: Place["source"], sourceId: string): Promise<Place | null> {
  const [row] = await q.query("SELECT * FROM places WHERE source = $1 AND source_id = $2", [source, sourceId]);
  return row ? rowToPlace(row) : null;
}

export type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** A lat/lng box around a point, wide enough to hold a circle of radiusKm. */
export function boxAround(lat: number, lng: number, radiusKm: number): Box {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Stored places inside a box (does not wrap the antimeridian). */
export async function placesInBox(q: Queryable, box: Box, limit = 500): Promise<Place[]> {
  const rows = await q.query(
    "SELECT * FROM places WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4 LIMIT $5",
    [box.minLat, box.maxLat, box.minLng, box.maxLng, limit],
  );
  return rows.map(rowToPlace);
}

/** Stored places whose name contains the text, case-insensitively. */
export async function findPlacesByName(q: Queryable, text: string, limit = 20): Promise<Place[]> {
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await q.query("SELECT * FROM places WHERE name ILIKE $1 ORDER BY name LIMIT $2", [pattern, limit]);
  return rows.map(rowToPlace);
}

export async function setGooglePlaceId(q: Queryable, id: string, googlePlaceId: string | null, now: number): Promise<void> {
  await q.query("UPDATE places SET google_place_id = $2, updated_at = $3 WHERE id = $1", [id, googlePlaceId, toTs(now)]);
}

/** Deletes a place and, through ON DELETE CASCADE, every visit, score and list entry for it. */
export async function deletePlace(q: Queryable, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM places WHERE id = $1 RETURNING id", [id])).length === 1;
}
