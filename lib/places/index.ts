import "server-only";
import type { LatLng, Place } from "../types";

// Place lookup, owned by the places track. Both functions return places that
// are already stored (upserted into `places` via lib/db/places), so every
// result has a stable Forage id that visits, lists and recs can reference.
// Sources: OpenStreetMap (Overpass for nearby, Photon for search); Google
// Places adds live details when GOOGLE_PLACES_KEY is set (only its id is stored).

/** Restaurants, cafes and bars matching free text, nearest to `near` first when given. At most 20. */
export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  void q;
  void near;
  throw new Error("not implemented");
}

/** Restaurants, cafes and bars within radiusKm of a point, nearest first. */
export async function nearbyPlaces(lat: number, lng: number, radiusKm: number): Promise<Place[]> {
  void lat;
  void lng;
  void radiusKm;
  throw new Error("not implemented");
}
