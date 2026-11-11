import { z } from "zod";

// Finding a city or neighborhood by name with Photon (OpenStreetMap data,
// komoot's public instance). Only areas, not streets or buildings: Explore
// recommends around a place, and the radius follows how big the place is.

export const PHOTON_URL = "https://photon.komoot.io/api/";
const LAYERS = ["city", "district", "locality", "county"] as const;
const LIMIT = 6;

export type Area = { label: string; name: string; lat: number; lng: number; radiusKm: number };

const FeatureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.looseObject({
    name: z.string().optional(),
    type: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }),
});
const CollectionSchema = z.object({ features: z.array(z.unknown()) });

/** Big areas get a wider circle than neighborhoods. */
export function radiusFor(type: string | undefined): number {
  if (type === "county" || type === "state") return 15;
  if (type === "city") return 5;
  return 2;
}

/** Areas from a Photon answer, labelled like "Mission District, San Francisco, United States", without duplicates. */
export function parseAreas(json: unknown): Area[] {
  const coll = CollectionSchema.safeParse(json);
  if (!coll.success) return [];
  const areas: Area[] = [];
  for (const raw of coll.data.features) {
    const f = FeatureSchema.safeParse(raw);
    if (!f.success || !f.data.properties.name) continue;
    const p = f.data.properties;
    const parts = [p.name, p.city !== p.name ? p.city : undefined, p.state !== p.name ? p.state : undefined, p.country].filter((s): s is string => Boolean(s));
    const label = [...new Set(parts)].join(", ");
    if (areas.some((a) => a.label === label)) continue;
    const [lng, lat] = f.data.geometry.coordinates;
    areas.push({ label, name: p.name!, lat, lng, radiusKm: radiusFor(p.type) });
  }
  return areas;
}

export async function geocodeArea(fetchFn: typeof fetch, q: string): Promise<Area[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("lang", "en");
  for (const l of LAYERS) url.searchParams.append("layer", l);
  const res = await fetchFn(url, { headers: { accept: "application/json", "user-agent": "Forage (https://forage.xanom.co)" }, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`Photon answered HTTP ${res.status}`);
  return parseAreas(await res.json());
}
