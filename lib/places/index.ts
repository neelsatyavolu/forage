import "server-only";
import { getDb } from "../db/client";
import { getPlace, type Box } from "../db/places";
import { env } from "../server/env";
import type { LatLng, Place } from "../types";
import { googleClient, type LiveDetails } from "./google";
import { nearbyWith } from "./nearby";
import { photonNearby, photonSearch } from "./osm";
import { overpassBox } from "./overpass";
import { liveDetails, searchStored } from "./store";

// Place lookup, owned by the places track. Both functions return places that
// are already stored (upserted into `places` via lib/db/places), so every
// result has a stable Forage id that visits, lists and recs can reference.
// Sources are free: OpenStreetMap (Overpass mirrors for nearby, cached by map
// tile, and Photon for search). Google Places is called only when someone
// opens a place's details and GOOGLE_PLACES_KEY is set (only its id is stored).

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
  const deps = { db: await getDb(), overpass: (box: Box) => overpassBox(box), photon: (at: LatLng, km: number) => photonNearby(at, km), now: Date.now() };
  return (await nearbyWith(deps, { lat, lng }, radiusKm)).places;
}

/** Live Google details for a stored place, or null without a key or a match. Only for a user opening one place, never for lists or recs. */
export async function placeLiveDetails(placeId: string): Promise<LiveDetails | null> {
  const key = env().GOOGLE_PLACES_KEY;
  if (!key) return null;
  const db = await getDb();
  const place = await getPlace(db, placeId);
  return place ? liveDetails(db, place, googleClient(key), Date.now()) : null;
}
