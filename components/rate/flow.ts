import { distanceKm } from "@/lib/places/geo";
import { guessOccasion, placeKind } from "@/lib/rate/occasion";
import { RATE_GOAL, RATING_BAND, type LatLng, type Occasion, type Place, type Reaction } from "@/lib/types";
import type { DeckPlace } from "./api";

// Pure pieces of the rating flow: what a place to rate is, the order they're
// rated in, and how many "which did you like more?" questions each gets.

/** A place picked to rate: from the deck, or from search (then kind and occasion are worked out here). */
export type Candidate = { place: Place; kind: string; distanceKm: number | null; occasion: Occasion };

/** A place rated in this flow: its visit, the reaction and score now, and the comparison state. */
export type Rated = {
  visitId: string;
  reaction: Reaction;
  rating: number | null;
  occasion: Occasion;
  score: number | null;
  /** The next question's opponent, as the server last proposed it. */
  opponent: Place | null;
  asked: number;
  /** Questions this place gets: 1 while the user has fewer than 10 rated, else 2. */
  limit: number;
  /** True after a change that can move the score, so the opponent is fetched again. */
  stale: boolean;
};

export const fromDeck = (d: DeckPlace): Candidate => ({ place: d.place, kind: d.kind, distanceKm: d.distanceKm, occasion: d.guessedOccasion });

export const fromSearch = (place: Place, at: LatLng | null): Candidate => ({
  place,
  kind: placeKind(place),
  distanceKm: at ? distanceKm(at, place) : null,
  occasion: guessOccasion(place),
});

/** Adds the candidate at the end, or takes it out when it's already there. */
export const toggleQueue = (queue: readonly Candidate[], c: Candidate): Candidate[] =>
  queue.some((q) => q.place.id === c.place.id) ? queue.filter((q) => q.place.id !== c.place.id) : [...queue, c];

/** The first unrated place at or after `from`, or -1. */
export function nextUnrated(queue: readonly Candidate[], rated: Readonly<Record<string, Rated>>, from: number): number {
  for (let i = Math.max(0, from); i < queue.length; i++) if (!rated[queue[i].place.id]) return i;
  return -1;
}

export const unratedCount = (queue: readonly Candidate[], rated: Readonly<Record<string, Rated>>): number => queue.filter((q) => !rated[q.place.id]).length;

/** One question per place while onboarding (fewer than 10 rated before this one), two after. */
export const compareLimit = (ratedBefore: number): number => (ratedBefore < RATE_GOAL ? 1 : 2);

/** True when this place should get another question now. */
export const wantsQuestion = (r: Rated): boolean => r.asked < r.limit && (r.opponent !== null || r.stale);

/** The whole numbers a reaction can be fine-tuned to: Didn't like 1-4, Fine 5-7, Loved 8-10. */
export function bandValues(reaction: Reaction): number[] {
  const [lo, hi] = RATING_BAND[reaction];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** The reaction a 1-10 rating sits in. */
export function reactionFor(rating: number): Reaction {
  const hit = (Object.keys(RATING_BAND) as Reaction[]).find((r) => rating >= RATING_BAND[r][0] && rating <= RATING_BAND[r][1]);
  return hit ?? "fine";
}

/** Number keys rate in one press: "8" is Loved at 8, "0" is 10. */
export function ratingFromKey(key: string): { reaction: Reaction; rating: number } | null {
  if (!/^[0-9]$/.test(key)) return null;
  const rating = key === "0" ? 10 : Number(key);
  return { reaction: reactionFor(rating), rating };
}

/** The places rated in this flow, best score first, for the finish screen. */
export function bestFirst(queue: readonly Candidate[], rated: Readonly<Record<string, Rated>>): { candidate: Candidate; rated: Rated }[] {
  return queue
    .flatMap((c) => (rated[c.place.id] ? [{ candidate: c, rated: rated[c.place.id] }] : []))
    .sort((a, b) => (b.rated.score ?? -1) - (a.rated.score ?? -1));
}
