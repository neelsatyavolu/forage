import type { LatLng, PlaceInput } from "../types";
import { PlacesError } from "./errors";
import { FOOD_AMENITIES, fromOverpass, fromPhoton, overpassQuery } from "./osm-parse";

// OpenStreetMap lookups: Photon (komoot) for text search, Overpass for
// what's nearby. Both are free and ask for light, identified use, so answers
// are cached for a while, a busy refusal is retried once, and a request
// that still fails throws, so "no answer" is never mistaken for "no places".

const PHOTON = "https://photon.komoot.io/api/";
/** The main Overpass server is often at capacity; a busy answer moves on to the next. */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const USER_AGENT = "Forage (forage.xanom.co)";
const TIMEOUT_MS = 10_000;
const RETRY_MS = 700;
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 300;
const PHOTON_LIMIT = 20;
const OVERPASS_LIMIT = 300;
/** Overpass gets slow and heavy past this; wider searches also use stored places. */
export const OVERPASS_MAX_KM = 5;

type Cached = { at: number; rows: PlaceInput[] };
const cache = new Map<string, Cached>();

function remember(key: string, rows: PlaceInput[]): PlaceInput[] {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Tries each URL in turn (the same one twice when only one is given). */
async function fetchJson(urls: readonly string[], init: RequestInit, what: string, fetcher: typeof fetch): Promise<unknown> {
  const tries = urls.length > 1 ? urls : [urls[0], urls[0]];
  for (const [attempt, url] of tries.entries()) {
    if (attempt) await new Promise((r) => setTimeout(r, RETRY_MS));
    let res: Response;
    try {
      res = await fetcher(url, { ...init, headers: { "User-Agent": USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) break;
    return res.json().catch(() => ({}));
  }
  throw new PlacesError(`${what} isn't answering. Try again in a moment.`, 503);
}

/** Places to eat or drink matching the text, biased toward `near`. */
export async function photonSearch(q: string, near: LatLng | null, fetcher: typeof fetch = fetch): Promise<PlaceInput[]> {
  const params = new URLSearchParams({ q, limit: String(PHOTON_LIMIT), lang: "en" });
  for (const a of FOOD_AMENITIES) params.append("osm_tag", `amenity:${a}`);
  params.append("osm_tag", "shop:bakery");
  if (near) {
    params.set("lat", near.lat.toFixed(3));
    params.set("lon", near.lng.toFixed(3));
    params.set("zoom", "12");
    params.set("location_bias_scale", "0.3");
  }
  const key = `p:${params}`;
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.rows;
  const body = (await fetchJson([`${PHOTON}?${params}`], {}, "Place search", fetcher)) as { features?: unknown[] };
  const rows = (Array.isArray(body.features) ? body.features : []).map(fromPhoton).filter((p): p is PlaceInput => p !== null);
  return remember(key, rows);
}

/** Named places to eat or drink within radiusKm (capped at OVERPASS_MAX_KM). */
export async function overpassNearby(lat: number, lng: number, radiusKm: number, fetcher: typeof fetch = fetch): Promise<PlaceInput[]> {
  const km = Math.min(radiusKm, OVERPASS_MAX_KM);
  // Round so nearby requests share a cache entry (about 100 m).
  const key = `o:${lat.toFixed(3)},${lng.toFixed(3)},${km.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.rows;
  const body = (await fetchJson(
    OVERPASS,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: overpassQuery(lat, lng, km * 1000, OVERPASS_LIMIT) }).toString() },
    "The map data service",
    fetcher,
  )) as { elements?: unknown[] };
  const rows = (Array.isArray(body.elements) ? body.elements : []).map(fromOverpass).filter((p): p is PlaceInput => p !== null);
  return remember(key, rows);
}

/** Test hook: forget cached answers. */
export function clearOsmCache(): void {
  cache.clear();
}
