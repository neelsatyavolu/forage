import { boxAround, type Box } from "../db/places";
import type { LatLng } from "../types";

// A fixed grid for caching nearby searches: 0.02 degrees square, about 2.2 km
// north-south (narrower east-west away from the equator). Any search maps to
// the same tiles, so nearby searches share what was fetched. The grid doesn't
// wrap the antimeridian, like the stored-place box queries.

export const TILE_DEG = 0.02;

const index = (deg: number) => Math.floor(deg / TILE_DEG);
const key = (i: number, j: number) => `${i}:${j}`;

/** Tile keys covering a circle of radiusKm around a point. */
export function tilesAround(at: LatLng, radiusKm: number): string[] {
  const box = boxAround(at.lat, at.lng, radiusKm);
  const out: string[] = [];
  for (let i = index(box.minLat); i <= index(box.maxLat); i++) {
    for (let j = index(box.minLng); j <= index(box.maxLng); j++) out.push(key(i, j));
  }
  return out;
}

/** The box covering every given tile. */
export function tilesBox(tiles: readonly string[]): Box {
  const cells = tiles.map((t) => t.split(":").map(Number));
  const is = cells.map(([i]) => i);
  const js = cells.map(([, j]) => j);
  const edge = (n: number) => Number((n * TILE_DEG).toFixed(6));
  return { minLat: edge(Math.min(...is)), maxLat: edge(Math.max(...is) + 1), minLng: edge(Math.min(...js)), maxLng: edge(Math.max(...js) + 1) };
}
