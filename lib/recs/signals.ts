import type { LatLng, Place, RecMode } from "../types";

// The parts of the fast score, each in [0, 1], and how each mode mixes them.

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Prior mean rating and how many reviews it is worth (Bayesian average). */
const PRIOR_RATING = 4.0;
const PRIOR_REVIEWS = 50;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Crowd quality from a live rating (1-5) when a source attached one to the
 * place's tags, pulled toward 4.0 when there are few reviews, then mapped so
 * 3.0 -> 0 and 5.0 -> 1. Null when there is no rating.
 */
export function qualityPrior(tags: Place["tags"]): number | null {
  const t = tags as Record<string, unknown>;
  const rating = num(t.rating);
  if (rating === null || rating < 1 || rating > 5) return null;
  const count = Math.max(0, num(t.userRatingCount) ?? num(t.ratingCount) ?? num(t.reviewCount) ?? 0);
  const adjusted = (PRIOR_RATING * PRIOR_REVIEWS + rating * count) / (PRIOR_REVIEWS + count);
  return Math.max(0, Math.min(1, (adjusted - 3) / 2));
}

/** 1 at the point, about 0.37 at 40% of the radius, smooth all the way out. */
export function distanceScore(km: number, radiusKm: number): number {
  return Math.exp(-km / Math.max(0.3, radiusKm * 0.4));
}

export type Signals = { taste: number; quality: number; distance: number; novelty: number; special: number; adjacency: number };
export type Mix = Record<keyof Signals, number>;

const mix = (m: Partial<Mix>): Mix => ({ taste: 0, quality: 0, distance: 0, novelty: 0, special: 0, adjacency: 0, ...m });

/**
 * near: balanced. travel: crowd quality counts more and distance less.
 * splurge: special-occasion and pricier places boosted, price taste ignored.
 * stretch: cuisines you haven't had, scored by closeness to ones you like.
 */
export const MODE_MIX: Record<RecMode, Mix> = {
  near: mix({ taste: 0.5, quality: 0.2, distance: 0.2, novelty: 0.1 }),
  travel: mix({ taste: 0.35, quality: 0.4, distance: 0.15, novelty: 0.1 }),
  splurge: mix({ taste: 0.35, quality: 0.3, distance: 0.1, novelty: 0.05, special: 0.2 }),
  stretch: mix({ taste: 0.2, quality: 0.2, distance: 0.15, adjacency: 0.45 }),
};

export const combine = (s: Signals, m: Mix): number => (Object.keys(m) as (keyof Signals)[]).reduce((sum, k) => sum + m[k] * s[k], 0);

/** How much a place reads as a special night: price 3-4, or tagged special / night out / upscale. */
export function specialness(place: Pick<Place, "priceLevel" | "tags">): number {
  const t = place.tags as Record<string, unknown>;
  const has = (key: string, value: string) => Array.isArray(t[key]) && (t[key] as unknown[]).includes(value);
  const price = place.priceLevel === 4 ? 0.7 : place.priceLevel === 3 ? 0.5 : 0;
  const occasion = has("occasions", "special") ? 0.5 : has("occasions", "night_out") ? 0.3 : 0;
  const vibe = has("vibe", "upscale") ? 0.2 : 0;
  return Math.min(1, price + occasion + vibe);
}
