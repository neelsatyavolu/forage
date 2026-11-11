import type { LatLng } from "../types";
import { PlacesError } from "./errors";

// Google Places API (New) over plain HTTP, ported from Lodestar. Every call
// names the fields it needs (Google bills by field) and times out. Under
// Google's terms only the place id may be stored; everything in LiveDetails
// is fetched when shown and never saved.

const PLACES = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 10_000;
const BIAS_RADIUS_M = 500;

const DETAIL_FIELDS = [
  "id", "rating", "userRatingCount", "priceLevel", "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "regularOpeningHours.weekdayDescriptions", "currentOpeningHours.openNow", "editorialSummary",
].join(",");

const PRICE: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

export type LiveDetails = {
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  openNow: boolean | null;
  hours: string[];
  summary: string | null;
};

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function googleClient(key: string, fetcher: typeof fetch = fetch) {
  async function call(url: string, init: { method?: string; body?: unknown; fields: string }): Promise<Obj> {
    let res: Response;
    try {
      res = await fetcher(url, {
        method: init.method ?? "GET",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": init.fields },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PlacesError("Couldn't reach Google Maps. Try again.", 502);
    }
    const body = o(await res.json().catch(() => ({})));
    if (!res.ok) {
      console.error("[places] google", res.status, str(o(body.error).message) ?? "");
      throw new PlacesError(res.status === 404 ? "That place wasn't found." : "Google Maps didn't answer. Try again.", res.status === 404 ? 404 : 502);
    }
    return body;
  }

  return {
    /** Google's id for the best match of a name near a point, or null. */
    async locate(query: string, near: LatLng): Promise<{ placeId: string; location: LatLng } | null> {
      const body = await call(`${PLACES}/places:searchText`, {
        method: "POST",
        fields: "places.id,places.location",
        body: { textQuery: query, pageSize: 1, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: BIAS_RADIUS_M } } },
      });
      const first = o(Array.isArray(body.places) ? body.places[0] : null);
      const loc = o(first.location);
      const placeId = str(first.id);
      const lat = num(loc.latitude);
      const lng = num(loc.longitude);
      return placeId && lat !== null && lng !== null ? { placeId, location: { lat, lng } } : null;
    },

    async details(placeId: string): Promise<LiveDetails> {
      const p = await call(`${PLACES}/places/${encodeURIComponent(placeId)}`, { fields: DETAIL_FIELDS });
      const hours = o(p.regularOpeningHours).weekdayDescriptions;
      const openNow = o(p.currentOpeningHours).openNow;
      return {
        rating: num(p.rating),
        ratingCount: num(p.userRatingCount),
        priceLevel: PRICE[str(p.priceLevel) ?? ""] ?? null,
        phone: str(p.nationalPhoneNumber),
        website: str(p.websiteUri),
        mapsUrl: str(p.googleMapsUri),
        openNow: typeof openNow === "boolean" ? openNow : null,
        hours: Array.isArray(hours) ? hours.filter((h): h is string => typeof h === "string").slice(0, 7) : [],
        summary: str(o(p.editorialSummary).text),
      };
    },
  };
}

export type GoogleClient = ReturnType<typeof googleClient>;
