import type { Place } from "../types";

export { placeKind } from "../rate/occasion";

/** The street part of an address ("123 Grove St"), else the city, else null. */
export function shortAddress(place: Pick<Place, "address" | "city">): string | null {
  const street = place.address?.split(",")[0]?.trim();
  return street || place.city || null;
}

/** "290 m" under a kilometre, "1.4 km" above. */
export const distanceLabel = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

const PRICE = ["$", "$$", "$$$", "$$$$"];
export const priceLabel = (level: number | null): string | null => (level ? PRICE[level - 1] : null);
