import "server-only";
import { getDb } from "../db/client";
import { getPlace } from "../db/places";
import { env } from "../server/env";
import type { LatLng, Place } from "../types";
import { googleClient, type LiveDetails } from "./google";
import { overpassNearby, photonSearch } from "./osm";
import { liveDetails, nearbyStored, searchStored } from "./store";

// Place lookup, owned by the places track. Both functions return places that
// are already stored (upserted into `places` via lib/db/places), so every
// result has a stable Forage id that visits, lists and recs can reference.
// Sources: OpenStreetMap (Overpass for nearby, Photon for search); Google
// Places adds live details when GOOGLE_PLACES_KEY is set (only its id is stored).

export { PlacesError } from "./errors";
export type { LiveDetails } from "./google";

/** Restaurants, cafes and bars matching free text, nearest to `near` first when given. At most 20. */
export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  const text = q.trim();
  if (!text) return [];
  return searchStored(await getDb(), text, near ?? null, () => photonSearch(text, near ?? null), Date.now());
}

/** Restaurants, cafes and bars within radiusKm of a point, nearest first. */
export async function nearbyPlaces(lat: number, lng: number, radiusKm: number): Promise<Place[]> {
  return nearbyStored(await getDb(), { lat, lng }, radiusKm, () => overpassNearby(lat, lng, radiusKm), Date.now());
}

/** Live Google details for a stored place, or null without a key or a match. */
export async function placeLiveDetails(placeId: string): Promise<LiveDetails | null> {
  const key = env().GOOGLE_PLACES_KEY;
  if (!key) return null;
  const db = await getDb();
  const place = await getPlace(db, placeId);
  return place ? liveDetails(db, place, googleClient(key), Date.now()) : null;
}
