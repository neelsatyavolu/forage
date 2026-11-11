import type { MapPin } from "@/components/map/pins";
import type { Occasion, Place } from "@/lib/types";
import type { BeenRow, VisitsResponse } from "./types";

/**
 * One row per place per occasion, from the newest visit (its reaction and
 * date) and the fitted score, best first. Unscored rows go last.
 */
export function beenRows({ visits, places, scores }: VisitsResponse): BeenRow[] {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const scoreOf = new Map(scores.map((s) => [`${s.placeId}:${s.occasion}`, s.score]));
  const rows = new Map<string, BeenRow>();
  // Visits arrive newest first, so the first one seen for a key is the latest.
  for (const v of visits) {
    const key = `${v.placeId}:${v.occasion}`;
    const seen = rows.get(key);
    if (seen) {
      rows.set(key, { ...seen, visits: seen.visits + 1 });
      continue;
    }
    const place = placeById.get(v.placeId);
    if (!place) continue;
    rows.set(key, { place, occasion: v.occasion, score: scoreOf.get(key) ?? null, reaction: v.reaction, lastVisited: v.visitedOn, visits: 1 });
  }
  return [...rows.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.place.name.localeCompare(b.place.name));
}

export function filterOccasion(rows: readonly BeenRow[], occasion: Occasion | "all"): BeenRow[] {
  return occasion === "all" ? [...rows] : rows.filter((r) => r.occasion === occasion);
}

/** How many rows each occasion has, for the filter pills. */
export function occasionCounts(rows: readonly BeenRow[]): Record<Occasion | "all", number> {
  const base = { all: rows.length, quick: 0, casual: 0, night_out: 0, special: 0 };
  return rows.reduce((acc, r) => ({ ...acc, [r.occasion]: acc[r.occasion] + 1 }), base);
}

/** Map pins: one per place, with its best score across the shown rows. */
export function beenPins(rows: readonly BeenRow[]): MapPin[] {
  const best = new Map<string, MapPin>();
  for (const r of rows) {
    const prev = best.get(r.place.id);
    if (!prev || (r.score ?? -1) > (prev.score ?? -1)) best.set(r.place.id, { id: r.place.id, name: r.place.name, lat: r.place.lat, lng: r.place.lng, kind: "been", score: r.score });
  }
  return [...best.values()];
}

export function wantPins(places: readonly Place[]): MapPin[] {
  return places.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, kind: "want", score: null }));
}

/** "Chinese, noodles · San Francisco": what a place is and where, for a list row. */
export function placeLine(place: Place): string {
  const what = place.cuisine.length ? place.cuisine.slice(0, 3).join(", ") : (place.tags.attributes?.[0] ?? null);
  const where = place.address ?? place.city;
  return [what ? what.charAt(0).toUpperCase() + what.slice(1) : null, where].filter(Boolean).join(" · ");
}
