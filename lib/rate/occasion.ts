import type { Occasion, Place } from "../types";

// The occasion a place is most likely rated under, so the rating card can
// start with it chosen. First match wins: the place's own single occasion,
// then $$$$, then what kind of place OSM says it is.

const BY_AMENITY: Record<string, Occasion> = {
  "fast food": "quick",
  "food court": "quick",
  "ice cream": "quick",
  cafe: "quick",
  bakery: "quick",
  bar: "night_out",
  pub: "night_out",
  biergarten: "night_out",
  restaurant: "casual",
};

export function guessOccasion(place: Pick<Place, "tags" | "priceLevel">): Occasion {
  const own = place.tags.occasions ?? [];
  if (own.length === 1) return own[0];
  if (place.priceLevel === 4) return "special";
  const amenity = place.tags.attributes?.[0];
  return (amenity && BY_AMENITY[amenity]) || "casual";
}

const title = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** What to call the place on a tile: its first cuisine, else its amenity ("Cafe", "Bar"), title case. */
export function placeKind(place: Pick<Place, "cuisine" | "tags">): string {
  const kind = place.cuisine[0] ?? place.tags.attributes?.[0];
  return kind ? title(kind) : "Place";
}
