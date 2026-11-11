import type { Box } from "../db/places";
import type { PlaceInput } from "../types";

// Turns OpenStreetMap answers (Photon search features, Overpass elements)
// into place inputs. Only places to eat or drink are kept.

/** OSM amenity values Forage lists. */
export const FOOD_AMENITIES = ["restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "ice_cream", "biergarten"] as const;
const FOOD = new Set<string>([...FOOD_AMENITIES, "bakery"]);

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const OSM_TYPE: Record<string, string> = { N: "node", W: "way", R: "relation", node: "node", way: "way", relation: "relation" };

const clip = (v: string | null, max: number) => (v ? v.slice(0, max) : null);
const words = (v: string | null) => (v ? v.split(";").map((s) => s.trim().toLowerCase().replace(/_/g, " ")).filter(Boolean) : []);

function address(parts: (string | null)[]): string | null {
  const joined = parts.filter(Boolean).join(", ");
  return joined ? joined.slice(0, 500) : null;
}

/** A Photon feature as a place, or null when it isn't somewhere to eat or drink. */
export function fromPhoton(feature: unknown): PlaceInput | null {
  const f = (feature ?? {}) as Obj;
  const p = (f.properties ?? {}) as Obj;
  const coords = ((f.geometry ?? {}) as Obj).coordinates;
  const [lng, lat] = Array.isArray(coords) ? coords.map(num) : [null, null];
  const name = str(p.name);
  const type = OSM_TYPE[str(p.osm_type) ?? ""];
  const id = num(p.osm_id) ?? Number(str(p.osm_id));
  const value = str(p.osm_value) ?? "";
  if (!name || lat == null || lng == null || !type || !Number.isFinite(id) || !FOOD.has(value)) return null;
  const street = [str(p.housenumber), str(p.street)].filter(Boolean).join(" ") || null;
  const city = str(p.city) ?? str(p.town) ?? str(p.village) ?? str(p.district);
  return {
    source: "osm",
    sourceId: `${type}/${id}`,
    googlePlaceId: null,
    name: name.slice(0, 200),
    lat,
    lng,
    address: address([street, city, str(p.state), str(p.country)]),
    city: clip(city, 200),
    country: clip(str(p.country), 100),
    cuisine: [],
    priceLevel: null,
    tags: { attributes: [value.replace(/_/g, " ")] },
  };
}

const YES = (v: unknown) => v === "yes" || v === "only";

/** An Overpass element (node, or way/relation with `out center`) as a place. */
export function fromOverpass(element: unknown): PlaceInput | null {
  const e = (element ?? {}) as Obj;
  const t = (e.tags ?? {}) as Obj;
  const center = (e.center ?? {}) as Obj;
  const lat = num(e.lat) ?? num(center.lat);
  const lng = num(e.lon) ?? num(center.lon);
  const type = OSM_TYPE[str(e.type) ?? ""];
  const id = num(e.id);
  const name = str(t.name) ?? str(t["name:en"]);
  const amenity = str(t.amenity) ?? str(t.shop) ?? "";
  if (!name || lat == null || lng == null || !type || id == null || !FOOD.has(amenity)) return null;
  const street = [str(t["addr:housenumber"]), str(t["addr:street"])].filter(Boolean).join(" ") || null;
  const city = str(t["addr:city"]);
  const attributes = [
    amenity.replace(/_/g, " "),
    YES(t.outdoor_seating) ? "outdoor seating" : null,
    YES(t.takeaway) ? "takeaway" : null,
    YES(t.delivery) ? "delivery" : null,
    YES(t["diet:vegetarian"]) ? "vegetarian options" : null,
    YES(t["diet:vegan"]) ? "vegan options" : null,
    YES(t.wheelchair) ? "wheelchair accessible" : null,
  ].filter((a): a is string => a !== null);
  const tags = {
    attributes,
    ...(str(t.opening_hours) ? { openingHours: str(t.opening_hours)!.slice(0, 500) } : {}),
    ...(str(t.website) ?? str(t["contact:website"]) ? { website: (str(t.website) ?? str(t["contact:website"]))!.slice(0, 500) } : {}),
    ...(str(t.phone) ?? str(t["contact:phone"]) ? { phone: (str(t.phone) ?? str(t["contact:phone"]))!.slice(0, 60) } : {}),
  };
  return {
    source: "osm",
    sourceId: `${type}/${id}`,
    googlePlaceId: null,
    name: name.slice(0, 200),
    lat,
    lng,
    address: address([street, city]),
    city: clip(city, 200),
    country: clip(str(t["addr:country"]), 100),
    cuisine: words(str(t.cuisine)).map((c) => c.slice(0, 60)).slice(0, 20),
    priceLevel: null,
    tags,
  };
}

/** The Overpass query for named places to eat or drink inside a box (south, west, north, east). */
export function overpassBoxQuery(box: Box, limit: number, timeoutS: number): string {
  const bbox = `(${[box.minLat, box.minLng, box.maxLat, box.maxLng].map((d) => d.toFixed(5)).join(",")})`;
  return `[out:json][timeout:${timeoutS}];(nwr["amenity"~"^(${FOOD_AMENITIES.join("|")})$"]["name"]${bbox};nwr["shop"="bakery"]["name"]${bbox};);out center tags ${limit};`;
}
