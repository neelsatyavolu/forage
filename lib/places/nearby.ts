import type { Queryable } from "../db/client";
import { markTiles, tileTimes } from "../db/osm-tiles";
import { boxAround, placesNearest, type Box } from "../db/places";
import type { LatLng, Place, PlaceInput } from "../types";
import { byDistance, distanceKm } from "./geo";
import type { OverpassResult } from "./overpass";
import { saveFetched } from "./store";
import { tilesAround, tilesBox } from "./tiles";

// Nearby search at no cost: Overpass answers are stored by map tile, and a
// tile is fetched again only after TILE_TTL_MS. When no Overpass mirror
// answers, stale tiles are served as they are; an area never fetched asks
// Photon instead. Results always come from the database, so places someone
// searched for or logged show up too.

/** Overpass gets slow and heavy past this; wider searches also use stored places. */
export const OVERPASS_MAX_KM = 5;
export const TILE_TTL_MS = 14 * 24 * 60 * 60_000;
const MAX_STORED = 500;

/** Where the answer came from: all tiles fresh, a new Overpass fetch, stale tiles, Photon, or stored places only. */
export type NearbySource = "cache" | "overpass" | "stale" | "photon" | "stored";

export type NearbyDeps = {
  db: Queryable;
  overpass: (box: Box) => Promise<OverpassResult>;
  photon: (at: LatLng, radiusKm: number) => Promise<PlaceInput[]>;
  now: number;
};

export type NearbyResult = { places: Place[]; source: NearbySource; mirror?: string };

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Fetches what the stored tiles are missing, and says where the answer came from. */
async function refresh(deps: NearbyDeps, at: LatLng, radiusKm: number): Promise<Omit<NearbyResult, "places">> {
  const { db, now } = deps;
  const tiles = tilesAround(at, Math.min(radiusKm, OVERPASS_MAX_KM));
  const fetchedAt = await tileTimes(db, tiles);
  const missing = tiles.filter((t) => (fetchedAt.get(t) ?? -Infinity) <= now - TILE_TTL_MS);
  if (missing.length === 0) return { source: "cache" };
  try {
    const answer = await deps.overpass(tilesBox(missing));
    await saveFetched(db, answer.rows, now);
    // A cut-short answer may be missing places, so its tiles are fetched again next time.
    if (!answer.truncated) await markTiles(db, missing, now);
    return { source: "overpass", mirror: answer.mirror };
  } catch (err) {
    console.error("[places] no Overpass mirror answered:", reason(err));
  }
  if (fetchedAt.size > 0) return { source: "stale" };
  try {
    await saveFetched(db, await deps.photon(at, radiusKm), now);
    return { source: "photon" };
  } catch (err) {
    console.error("[places] Photon nearby failed too, using stored places:", reason(err));
    return { source: "stored" };
  }
}

/** Places to eat or drink within radiusKm of a point, nearest first. Never throws for a source being down. */
export async function nearbyWith(deps: NearbyDeps, at: LatLng, radiusKm: number): Promise<NearbyResult> {
  const from = await refresh(deps, at, radiusKm);
  const stored = await placesNearest(deps.db, boxAround(at.lat, at.lng, radiusKm), at, MAX_STORED);
  return { ...from, places: byDistance(stored.filter((p) => distanceKm(at, p) <= radiusKm), at) };
}
