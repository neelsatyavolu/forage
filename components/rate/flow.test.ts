import { describe, expect, it } from "vitest";
import type { Place } from "@/lib/types";
import { bandValues, bestFirst, compareLimit, fromSearch, nextUnrated, ratingFromKey, reactionFor, toggleQueue, unratedCount, wantsQuestion, type Candidate, type Rated } from "./flow";

const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, name: id, source: "osm", sourceId: id, googlePlaceId: null, lat: 37.78, lng: -122.42, address: null, city: null, country: null, cuisine: [], priceLevel: null, tags: {}, updatedAt: 0, ...extra,
});
const cand = (id: string): Candidate => ({ place: place(id), kind: "Cafe", distanceKm: 0.2, occasion: "quick" });
const rated = (score: number | null, extra: Partial<Rated> = {}): Rated => ({ visitId: "v", reaction: "loved", rating: null, occasion: "casual", score, opponent: null, asked: 0, limit: 1, stale: false, ...extra });

describe("queue", () => {
  it("toggles a place in and out, keeping order", () => {
    const q = toggleQueue(toggleQueue([], cand("a")), cand("b"));
    expect(q.map((c) => c.place.id)).toEqual(["a", "b"]);
    expect(toggleQueue(q, cand("a")).map((c) => c.place.id)).toEqual(["b"]);
  });

  it("finds the next unrated place", () => {
    const q = [cand("a"), cand("b"), cand("c")];
    expect(nextUnrated(q, { a: rated(8) }, 0)).toBe(1);
    expect(nextUnrated(q, { a: rated(8), c: rated(6) }, 2)).toBe(-1);
    expect(unratedCount(q, { b: rated(6) })).toBe(2);
  });
});

describe("fromSearch", () => {
  it("works out kind, occasion and distance", () => {
    const c = fromSearch(place("x", { tags: { attributes: ["bar"] }, lat: 37.79 }), { lat: 37.78, lng: -122.42 });
    expect(c.kind).toBe("Bar");
    expect(c.occasion).toBe("night_out");
    expect(c.distanceKm).toBeCloseTo(1.11, 1);
    expect(fromSearch(place("y"), null).distanceKm).toBeNull();
  });
});

describe("comparisons", () => {
  it("asks one question while onboarding and two after", () => {
    expect(compareLimit(0)).toBe(1);
    expect(compareLimit(9)).toBe(1);
    expect(compareLimit(10)).toBe(2);
  });

  it("asks while under the limit and there's someone to ask about", () => {
    expect(wantsQuestion(rated(8, { opponent: place("o") }))).toBe(true);
    expect(wantsQuestion(rated(8, { opponent: place("o"), asked: 1 }))).toBe(false);
    expect(wantsQuestion(rated(8, { stale: true }))).toBe(true);
    expect(wantsQuestion(rated(8))).toBe(false);
  });
});

describe("ratings", () => {
  it("lists each band's numbers", () => {
    expect(bandValues("disliked")).toEqual([1, 2, 3, 4]);
    expect(bandValues("fine")).toEqual([5, 6, 7]);
    expect(bandValues("loved")).toEqual([8, 9, 10]);
  });

  it("maps a number key to reaction and rating", () => {
    expect(ratingFromKey("8")).toEqual({ reaction: "loved", rating: 8 });
    expect(ratingFromKey("0")).toEqual({ reaction: "loved", rating: 10 });
    expect(ratingFromKey("3")).toEqual({ reaction: "disliked", rating: 3 });
    expect(ratingFromKey("6")).toEqual({ reaction: "fine", rating: 6 });
    expect(ratingFromKey("x")).toBeNull();
    expect(reactionFor(5)).toBe("fine");
  });

  it("orders the finish list by score", () => {
    const list = bestFirst([cand("a"), cand("b"), cand("c")], { a: rated(6), c: rated(8.7) });
    expect(list.map((x) => x.candidate.place.id)).toEqual(["c", "a"]);
  });
});
