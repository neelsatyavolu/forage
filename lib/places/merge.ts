import type { Place, PlaceInput } from "../types";

/**
 * A refresh of a stored place that never loses what it already knew. Photon
 * search results carry no cuisine, hours or website; Overpass results do.
 * Whichever arrives second keeps the other's details.
 */
export function mergeInput(existing: Place | null, incoming: PlaceInput): PlaceInput {
  if (!existing) return incoming;
  const attributes = [...new Set([...(existing.tags.attributes ?? []), ...(incoming.tags.attributes ?? [])])];
  return {
    ...incoming,
    googlePlaceId: incoming.googlePlaceId ?? existing.googlePlaceId,
    address: incoming.address ?? existing.address,
    city: incoming.city ?? existing.city,
    country: incoming.country ?? existing.country,
    cuisine: incoming.cuisine.length ? incoming.cuisine : existing.cuisine,
    priceLevel: incoming.priceLevel ?? existing.priceLevel,
    tags: { ...existing.tags, ...incoming.tags, ...(attributes.length ? { attributes } : {}) },
  };
}
