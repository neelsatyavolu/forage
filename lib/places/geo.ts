import type { LatLng } from "../types";

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sorted nearest first, without changing the input. */
export function byDistance<T extends LatLng>(rows: readonly T[], from: LatLng): T[] {
  return rows
    .map((r) => ({ r, km: distanceKm(from, r) }))
    .sort((a, b) => a.km - b.km)
    .map(({ r }) => r);
}
