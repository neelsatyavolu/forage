import type { Queryable } from "../db/client";
import { boxAround, findPlacesByName, getPlaceBySource, placesInBox, setGooglePlaceId, upsertPlace } from "../db/places";
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

/** Upserts fetched places without losing details already stored for them. */
export async function saveFetched(q: Queryable, inputs: readonly PlaceInput[], now: number): Promise<Place[]> {
  const out: Place[] = [];
  for (const input of inputs) out.push(await upsertPlace(q, mergeInput(await getPlaceBySource(q, input.source, input.sourceId), input), now));
  return out;
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

/** Nearby: fetched and stored places within radiusKm, nearest first. A failed fetch falls back to stored places. */
export async function nearbyStored(q: Queryable, at: LatLng, radiusKm: number, fetchPlaces: () => Promise<PlaceInput[]>, now: number): Promise<Place[]> {
  let fetched: Place[] = [];
  try {
    fetched = await saveFetched(q, await fetchPlaces(), now);
  } catch (err) {
    console.error("[places] nearby fell back to stored places:", err instanceof Error ? err.message : err);
  }
  const stored = await placesInBox(q, boxAround(at.lat, at.lng, radiusKm));
  return byDistance(uniqueById([...fetched, ...stored]).filter((p) => distanceKm(at, p) <= radiusKm), at);
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
