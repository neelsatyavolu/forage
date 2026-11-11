import type { Queryable } from "../db/client";
import { findPlacesByName, getPlacesBySource, setGooglePlaceId, upsertPlacesBatch } from "../db/places";
import type { LatLng, Place, PlaceInput } from "../types";
import { byDistance, distanceKm } from "./geo";
import type { GoogleClient, LiveDetails } from "./google";
import { mergeInput } from "./merge";

// The database side of place lookup, with the network calls passed in so it
// can be tested: fetched places are merged into what's stored, and stored
// places fill in when a source has nothing (or is down).

export const SEARCH_LIMIT = 20;
/** A Google match farther than this from the OSM point is a different place. */
const GOOGLE_MATCH_KM = 0.25;

/** Rows per upsert statement, so a big Overpass answer stays a few queries. */
const SAVE_CHUNK = 500;
const sourceKey = (p: Pick<PlaceInput, "source" | "sourceId">) => `${p.source}:${p.sourceId}`;

/**
 * Upserts fetched places without losing details already stored for them.
 * Returns one place per distinct source id, in input order (a repeat keeps its last version).
 */
export async function saveFetched(q: Queryable, inputs: readonly PlaceInput[], now: number): Promise<Place[]> {
  const unique = [...new Map(inputs.map((p) => [sourceKey(p), p])).values()];
  const saved = new Map<string, Place>();
  for (let i = 0; i < unique.length; i += SAVE_CHUNK) {
    const chunk = unique.slice(i, i + SAVE_CHUNK);
    const existing = new Map<string, Place>();
    for (const source of new Set(chunk.map((p) => p.source))) {
      const ids = chunk.filter((p) => p.source === source).map((p) => p.sourceId);
      for (const p of await getPlacesBySource(q, source, ids)) existing.set(sourceKey(p), p);
    }
    const merged = chunk.map((p) => mergeInput(existing.get(sourceKey(p)) ?? null, p));
    for (const p of await upsertPlacesBatch(q, merged, now)) saved.set(sourceKey(p), p);
  }
  return [...new Map(inputs.map((p) => [sourceKey(p), saved.get(sourceKey(p))!])).values()];
}

const uniqueById = (rows: readonly Place[]) => [...new Map(rows.map((p) => [p.id, p])).values()];

/**
 * Text search: fetched places first in the source's order, then stored
 * matches it missed, nearest first when `near` is given. If the fetch fails
 * and nothing is stored, the fetch's error is thrown.
 */
export async function searchStored(q: Queryable, text: string, near: LatLng | null, fetchPlaces: () => Promise<PlaceInput[]>, now: number): Promise<Place[]> {
  const stored = await findPlacesByName(q, text, SEARCH_LIMIT);
  let fetched: Place[] = [];
  try {
    fetched = await saveFetched(q, await fetchPlaces(), now);
  } catch (err) {
    if (stored.length === 0) throw err;
    console.error("[places] search fell back to stored places:", err instanceof Error ? err.message : err);
  }
  const extra = near ? byDistance(stored, near) : stored;
  return uniqueById([...fetched, ...extra]).slice(0, SEARCH_LIMIT);
}

/**
 * Google's live details for a stored place, matching it to a Google id the
 * first time (only that id is saved). Null when Google has no match nearby.
 */
export async function liveDetails(q: Queryable, place: Place, google: GoogleClient, now: number): Promise<LiveDetails | null> {
  let googleId = place.googlePlaceId;
  if (!googleId) {
    const match = await google.locate([place.name, place.address ?? place.city].filter(Boolean).join(", "), place);
    if (!match || distanceKm(place, match.location) > GOOGLE_MATCH_KM) return null;
    googleId = match.placeId;
    await setGooglePlaceId(q, place.id, googleId, now);
  }
  return google.details(googleId);
}
