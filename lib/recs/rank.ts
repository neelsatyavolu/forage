import { adjacent } from "../taste/families";
import { placeValue, tasteSimilarity, visitScore, type HistoryItem } from "../taste/profile";
import { placeTags, splitCuisine, valueOf } from "../taste/vocab";
import type { Place, Rec, RecContext, TasteWeights } from "../types";
import { MODE_MIX, combine, distanceScore, haversineKm, qualityPrior, specialness, type CrowdRating, type Signals } from "./signals";

// The fast ranking: pure, no I/O, so it is the same in the app, the tests and
// the offline eval. AI reranking happens after this, on the top of the list.

/** Something new (not been), Go-to (been and liked), or both. */
export type RecFilter = "new" | "goto" | "all";

export type RankInput = {
  candidates: readonly Place[];
  history: readonly HistoryItem[];
  weights: TasteWeights;
  ctx: RecContext;
  filter: RecFilter;
  wanted: ReadonlySet<string>;
  /** Added to predicted scores for places the user hasn't been to. */
  calibration: number;
  /** Crowd ratings by place id, when a free source provides them. Absent in the app today. */
  ratings?: ReadonlyMap<string, CrowdRating>;
};

const WANTED_BONUS = 0.05;
const OCCASION_BONUS = 0.05;
/** A go-to needs at least this much liking (placeValue, -1..1). */
const GOTO_MIN = 0.2;
const RECENT_VISITS = 10;
/** Splurge shows only special places (pricey or tagged for special nights) once there are at least this many. */
const SPLURGE_MIN = 5;

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Predicted 0-10 score for a place the user hasn't been to. */
export const predictScore = (taste: number, quality: number | null, calibration: number): number =>
  round(clamp(2 + 7 * (0.7 * taste + 0.3 * (quality ?? taste)) + calibration, 0, 10), 1);

type Context = RankInput & { byId: Map<string, HistoryItem>; triedCuisines: Set<string>; recentCuisines: string[]; likedCuisines: [string, number][] };

function prepare(input: RankInput): Context {
  const byId = new Map(input.history.map((h) => [h.place.id, h]));
  const triedCuisines = new Set(input.history.flatMap((h) => splitCuisine(h.place.cuisine)));
  const recent = input.history
    .flatMap((h) => h.visits.map((v) => ({ on: v.visitedOn, cuisines: splitCuisine(h.place.cuisine) })))
    .sort((a, b) => b.on.localeCompare(a.on))
    .slice(0, RECENT_VISITS);
  const likedCuisines = Object.entries(input.weights)
    .filter(([t, w]) => t.startsWith("cuisine:") && w > 0.1)
    .map(([t, w]) => [valueOf(t), w] as [string, number]);
  return { ...input, byId, triedCuisines, recentCuisines: recent.flatMap((r) => r.cuisines), likedCuisines };
}

function keep(c: Context, place: Place, item: HistoryItem | undefined): boolean {
  if (c.ctx.mode === "stretch") {
    const cuisines = splitCuisine(place.cuisine);
    return !item && cuisines.length > 0 && !cuisines.some((x) => c.triedCuisines.has(x));
  }
  if (!item) return c.filter !== "goto";
  if (c.filter === "new") return false;
  return placeValue(item) >= (c.filter === "goto" ? GOTO_MIN : 0);
}

function signalsFor(c: Context, place: Place, item: HistoryItem | undefined, km: number): Signals {
  const { mode, radiusKm } = c.ctx;
  const cuisines = splitCuisine(place.cuisine);
  const skip = mode === "splurge" ? ["price"] : mode === "stretch" ? ["cuisine"] : [];
  const taste = item ? 0.5 + 0.5 * placeValue(item) : tasteSimilarity(placeTags(place), c.weights, skip);
  const overlap = c.recentCuisines.length ? c.recentCuisines.filter((x) => cuisines.includes(x)).length / c.recentCuisines.length : 0;
  const adjacency = Math.max(0, ...cuisines.flatMap((x) => c.likedCuisines.filter(([liked]) => adjacent(x, liked)).map(([, w]) => w)));
  return {
    taste,
    quality: qualityPrior(c.ratings?.get(place.id)) ?? 0.5,
    distance: distanceScore(km, radiusKm),
    novelty: item ? 0 : 1 - 0.5 * overlap,
    special: specialness(place),
    adjacency,
  };
}

function toRec(c: Context, place: Place, item: HistoryItem | undefined, km: number): { rec: Rec; rank: number } {
  const s = signalsFor(c, place, item, km);
  const occasions = (place.tags as Record<string, unknown>).occasions;
  const bonus =
    (c.wanted.has(place.id) ? WANTED_BONUS : 0) + (c.ctx.occasion && Array.isArray(occasions) && occasions.includes(c.ctx.occasion) ? OCCASION_BONUS : 0);
  const quality = qualityPrior(c.ratings?.get(place.id));
  const score = item?.visits[0] ? round(visitScore(item.visits[0], item.scores), 1) : predictScore(s.taste, quality, c.calibration);
  const rec: Rec = {
    place,
    score,
    signals: { taste: round(s.taste, 3), quality: quality === null ? null : round(quality, 3), distanceKm: round(km, 2), novelty: round(s.novelty, 3), visited: !!item, wanted: c.wanted.has(place.id) },
  };
  return { rec, rank: combine(s, MODE_MIX[c.ctx.mode]) + bonus };
}

/**
 * Splurge drops everyday places. Where the data marks too few places as
 * special (OSM rarely has price), it keeps everything rather than show almost
 * nothing; special places still rank higher through the mode's mix.
 */
function splurgeOnly<T extends { rec: Rec }>(mode: RecContext["mode"], ranked: T[]): T[] {
  if (mode !== "splurge") return ranked;
  const special = ranked.filter((r) => specialness(r.rec.place) > 0);
  return special.length >= SPLURGE_MIN ? special : ranked;
}

/** Candidates ranked best first for the context, after the mode's and filter's exclusions. */
export function rankPlaces(input: RankInput): Rec[] {
  const c = prepare(input);
  const seen = new Set<string>();
  const ranked: { rec: Rec; rank: number }[] = [];
  for (const place of input.candidates) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    const km = haversineKm(input.ctx, place);
    if (km > input.ctx.radiusKm * 1.05) continue;
    const item = c.byId.get(place.id);
    if (!keep(c, place, item)) continue;
    ranked.push(toRec(c, place, item, km));
  }
  return splurgeOnly(input.ctx.mode, ranked).sort((a, b) => b.rank - a.rank || a.rec.signals.distanceKm - b.rec.signals.distanceKm).map((r) => r.rec);
}
