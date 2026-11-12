import { distanceKm } from "../places/geo";
import type { LatLng, Occasion, Place } from "../types";
import { guessOccasion, placeKind } from "./occasion";

// The rating deck: nearby places ordered by how likely the user has been
// there, from free signals only. Nearness counts most; a chain or a
// well-known place (OSM brand or wikidata), one with hours, a website or a
// cuisine, and one several Forage users have logged count a little each.

export type DeckPlace = { place: Place; distanceKm: number; guessedOccasion: Occasion; kind: string };

/** Distance at which nearness falls to 1/e. */
const NEAR_KM = 0.6;
const NEAR_WEIGHT = 0.6;
const KNOWN_WEIGHT = 0.4;
/** Fewer Forage users than this at a place count as none, so one person's history can't be inferred. */
export const MIN_CROWD = 3;
/** The most tiles in a row that share an amenity. */
const MAX_RUN = 3;

/** In [0, 1]: how well known a place is, from its OSM tags and how many Forage users logged it. */
export function knownScore(place: Place, forageUsers: number): number {
  const t = place.tags;
  const parts = [
    t.brand || t.wikidata ? 0.35 : 0,
    t.openingHours ? 0.15 : 0,
    t.website ? 0.15 : 0,
    place.cuisine.length > 0 ? 0.1 : 0,
    forageUsers >= MIN_CROWD ? Math.min(0.25, 0.05 * forageUsers) : 0,
  ];
  return Math.min(1, parts.reduce((a, b) => a + b, 0));
}

export const likelihood = (km: number, known: number): number => NEAR_WEIGHT * Math.exp(-km / NEAR_KM) + KNOWN_WEIGHT * known;

const amenityOf = (p: Place) => p.tags.attributes?.[0] ?? "";

/** Reorders so no more than MAX_RUN in a row share an amenity, otherwise keeping the order. */
export function interleave<T>(items: readonly T[], keyOf: (item: T) => string, maxRun = MAX_RUN): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length > 0) {
    const tail = out.slice(-maxRun).map(keyOf);
    const blocked = tail.length === maxRun && tail.every((k) => k === tail[0]) ? tail[0] : null;
    const at = blocked === null ? 0 : rest.findIndex((it) => keyOf(it) !== blocked);
    out.push(rest.splice(at === -1 ? 0 : at, 1)[0]);
  }
  return out;
}

export type DeckInput = {
  at: LatLng;
  places: readonly Place[];
  /** Places to leave out: already rated, on Want to try, skipped, or already shown. */
  exclude: ReadonlySet<string>;
  /** Distinct Forage users with a visit, per place id. */
  crowd: ReadonlyMap<string, number>;
  limit: number;
};

/** The next `limit` places to show, most likely first, and whether more are left. */
export function buildDeck(input: DeckInput): { places: DeckPlace[]; hasMore: boolean } {
  const ranked = input.places
    .filter((p) => !input.exclude.has(p.id))
    .map((place) => {
      const km = distanceKm(input.at, place);
      return { place, km, likely: likelihood(km, knownScore(place, input.crowd.get(place.id) ?? 0)) };
    })
    .sort((a, b) => b.likely - a.likely || a.km - b.km || a.place.id.localeCompare(b.place.id));
  const page = interleave(ranked.slice(0, input.limit), (r) => amenityOf(r.place));
  return {
    places: page.map(({ place, km }) => ({ place, distanceKm: Math.round(km * 1000) / 1000, guessedOccasion: guessOccasion(place), kind: placeKind(place) })),
    hasMore: ranked.length > input.limit,
  };
}
