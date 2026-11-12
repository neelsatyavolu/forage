import { fromOverpass } from "../../lib/places/osm-parse";
import type { PlaceInput } from "../../lib/types";

// One line of `osmium export -f geojsonseq -a type,id` turned into the same
// place an Overpass answer gives: the feature is rebuilt as an Overpass
// element (a node's point, or a way's or relation's bounding-box centre, as
// Overpass `out center` reports it) and handed to the app's own fromOverpass.

type Obj = Record<string, unknown>;
type OverpassElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Obj };

/** Every [lng, lat] pair in a GeoJSON coordinates array, however deeply nested. */
function points(coords: unknown, out: [number, number][] = []): [number, number][] {
  if (!Array.isArray(coords)) return out;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") out.push([coords[0], coords[1]]);
  else for (const c of coords) points(c, out);
  return out;
}

/** The middle of a geometry's bounding box, or null when it has no coordinates. */
export function bboxCenter(geometry: unknown): { lat: number; lon: number } | null {
  const pts = points(((geometry ?? {}) as Obj).coordinates);
  if (pts.length === 0) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const mid = (a: number[]) => Number(((Math.min(...a) + Math.max(...a)) / 2).toFixed(7));
  return { lat: mid(lats), lon: mid(lngs) };
}

/** A geojsonseq feature as the Overpass element it stands for, or null when it isn't one. */
export function toElement(feature: unknown): OverpassElement | null {
  const f = (feature ?? {}) as Obj;
  const props = (f.properties ?? {}) as Obj;
  const type = props["@type"];
  const id = props["@id"];
  if (typeof type !== "string" || typeof id !== "number") return null;
  const tags = Object.fromEntries(Object.entries(props).filter(([k]) => !k.startsWith("@")));
  const geometry = (f.geometry ?? {}) as Obj;
  if (type === "node") {
    const [lon, lat] = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return typeof lat === "number" && typeof lon === "number" ? { type, id, lat, lon, tags } : null;
  }
  const center = bboxCenter(geometry);
  return center ? { type, id, center, tags } : null;
}

/** One geojsonseq line as a place, or null when it isn't a named place to eat or drink. */
export function placeFromLine(line: string): PlaceInput | null {
  const text = line.replace(/^\x1e/, "").trim();
  if (!text) return null;
  let feature: unknown;
  try {
    feature = JSON.parse(text);
  } catch {
    return null;
  }
  const element = toElement(feature);
  return element ? fromOverpass(element) : null;
}
