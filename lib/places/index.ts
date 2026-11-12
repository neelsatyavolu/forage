import "server-only";
import { waitUntil } from "@vercel/functions";
import { getDb } from "../db/client";
import { getPlace, type Box } from "../db/places";
import { env } from "../server/env";
import type { LatLng, Place } from "../types";
import { googleClient, type LiveDetails } from "./google";
import { nearbyWith, QUICK_OVERPASS_MS, TILE_TTL_MS, type NearbyDeps, type NearbySource } from "./nearby";
import { photonNearby, photonSearch } from "./osm";
import { overpassBox } from "./overpass";
import { refillTiles } from "./refill";
import { liveDetails, searchStored } from "./store";

// Place lookup, owned by the places track. Both functions return places that
// are already stored (upserted into `places` via lib/db/places), so every
// result has a stable Forage id that visits, lists and recs can reference.
// Sources are free: OpenStreetMap (Overpass mirrors for nearby, cached by map
// tile and refilled in the background, and Photon for search). Routes that
// call nearbyPlaces set maxDuration so the background refill can finish. Google Places is called only when someone
// opens a place's details and GOOGLE_PLACES_KEY is set (only its id is stored).

export { PlacesError } from "./errors";
export type { LiveDetails } from "./google";
export type { NearbySource } from "./nearby";

/** Restaurants, cafes and bars matching free text, nearest to `near` first when given. At most 20. */
export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  const text = q.trim();
  if (!text) return [];
  return searchStored(await getDb(), text, near ?? null, () => photonSearch(text, near ?? null), Date.now());
}

/** Restaurants, cafes and bars within radiusKm of a point, nearest first. */
export async function nearbyPlaces(lat: number, lng: number, radiusKm: number): Promise<Place[]> {
  return (await nearbySearch(lat, lng, radiusKm)).places;
}

/** nearbyPlaces with where the answer came from (fresh tiles, Overpass, stale tiles, Photon or stored places). */
export async function nearbySearch(lat: number, lng: number, radiusKm: number): Promise<{ places: Place[]; source: NearbySource }> {
  const db = await getDb();
  const now = Date.now();
  const refillDeps = {
    db,
    overpass: (box: Box, budgetMs: number) => overpassBox(box, { budgetMs, perMirrorMs: REFILL_PER_MIRROR_MS, breakOnTimeout: true }),
    clock: Date.now,
    staleBefore: now - TILE_TTL_MS,
  };
  const deps: NearbyDeps = {
    db,
    overpass: (box) => overpassBox(box, { budgetMs: QUICK_OVERPASS_MS, perMirrorMs: QUICK_OVERPASS_MS, maxMirrors: 1 }),
    photon: (at, km) => photonNearby(at, km),
    refill: (tiles, opts) => refillTiles(refillDeps, tiles, opts),
    defer: waitUntil,
    now,
  };
  const { places, source } = await nearbyWith(deps, { lat, lng }, radiusKm);
  return { places, source };
}

/** A background refill gives one mirror at most this long before trying the next. */
const REFILL_PER_MIRROR_MS = 30_000;

/** Live Google details for a stored place, or null without a key or a match. Only for a user opening one place, never for lists or recs. */
export async function placeLiveDetails(placeId: string): Promise<LiveDetails | null> {
  const key = env().GOOGLE_PLACES_KEY;
  if (!key) return null;
  const db = await getDb();
  const place = await getPlace(db, placeId);
  return place ? liveDetails(db, place, googleClient(key), Date.now()) : null;
}
