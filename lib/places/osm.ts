import { z } from "zod";
import type { LatLng, PlaceInput } from "../types";
import { PlacesError } from "./errors";
import { FOOD_AMENITIES, fromPhoton } from "./osm-parse";

// Photon (komoot), the free OpenStreetMap search: text search, and a nearby
// fallback for when no Overpass mirror answers (see ./overpass). Photon asks
// for light, identified use, so text answers are cached for a while, a busy
// refusal is retried once, and a request that still fails throws, so
// "no answer" is never mistaken for "no places".

const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";
/** Sent to every OpenStreetMap service. Names the app, nothing about the user. */
export const USER_AGENT = "Forage/1.0 (+https://forage.xanom.co)";
const TIMEOUT_MS = 10_000;
const RETRY_MS = 700;
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 300;
const PHOTON_LIMIT = 20;
/** Photon's most results per request. */
const PHOTON_NEARBY_LIMIT = 50;
/** The places the nearby fallback asks Photon for. */
const NEARBY_AMENITIES = ["restaurant", "cafe", "bar", "fast_food", "pub"] as const;
const PhotonAnswer = z.object({ features: z.array(z.unknown()) });

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

/** Up to 50 places to eat or drink within radiusKm, from Photon's reverse lookup. Not cached; callers store the result. */
export async function photonNearby(at: LatLng, radiusKm: number, fetcher: typeof fetch = fetch): Promise<PlaceInput[]> {
  const params = new URLSearchParams({ lat: at.lat.toFixed(5), lon: at.lng.toFixed(5), radius: String(radiusKm), limit: String(PHOTON_NEARBY_LIMIT), lang: "en" });
  for (const a of NEARBY_AMENITIES) params.append("osm_tag", `amenity:${a}`);
  const parsed = PhotonAnswer.safeParse(await fetchJson([`${PHOTON_REVERSE}?${params}`], {}, "Place search", fetcher));
  if (!parsed.success) throw new PlacesError("Place search sent an answer Forage couldn't read.", 502);
  return parsed.data.features.map(fromPhoton).filter((p): p is PlaceInput => p !== null);
}

/** Test hook: forget cached answers. */
export function clearOsmCache(): void {
  cache.clear();
}
