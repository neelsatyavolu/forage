import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../taste/profile";
import type { Place, RecContext, Visit } from "../types";
import { predictScore, rankPlaces, type RankInput } from "./rank";
import { distanceScore, haversineKm, qualityPrior, specialness } from "./signals";

const C = { lat: 40.7, lng: -74 };
const at = (km: number) => ({ lat: C.lat + km / 111.32, lng: C.lng });

const place = (id: string, cuisine: string[], km = 0.5, extra: Partial<Place> = {}): Place => ({
  id, source: "osm", sourceId: id, googlePlaceId: null, name: id, ...at(km), address: null, city: null, country: null,
  cuisine, priceLevel: 2, tags: {}, updatedAt: 0, ...extra,
});
const been = (p: Place, reaction: Visit["reaction"], scores: HistoryItem["scores"] = {}): HistoryItem => ({
  place: p, scores,
  visits: [{ id: `v-${p.id}`, userId: "u", placeId: p.id, visitedOn: "2026-11-01", reaction, occasion: "casual", dishes: [], note: null, createdAt: 0 }],
});

const ramenLoved = place("ramen-been", ["ramen"]);
const steakBad = place("steak-been", ["steak_house"]);
const history = [been(ramenLoved, "loved", { casual: 9.1 }), been(steakBad, "disliked")];
const weights = { "cuisine:ramen": 0.9, "cuisine:steak_house": -0.9, "price:4": -0.4 };

const input = (over: Omit<Partial<RankInput>, "ctx"> & { ctx?: Partial<RecContext> } = {}): RankInput => ({
  candidates: [ramenLoved, steakBad, place("ramen-new", ["ramen"]), place("steak-new", ["steak_house"]), place("korean-new", ["korean"]), place("taco-new", ["mexican"])],
  history, weights, filter: "new", wanted: new Set(), calibration: 0,
  ...over,
  ctx: { ...C, radiusKm: 3, mode: "near", ...over.ctx },
});
const ids = (input: RankInput) => rankPlaces(input).map((r) => r.place.id);

describe("signals", () => {
  it("measures distance", () => {
    expect(haversineKm(C, at(1))).toBeCloseTo(1, 2);
    expect(distanceScore(0, 3)).toBe(1);
    expect(distanceScore(3, 3)).toBeLessThan(0.1);
  });
  it("pulls ratings with few reviews toward the prior", () => {
    expect(qualityPrior({})).toBeNull();
    expect(qualityPrior({ rating: 9 })).toBeNull();
    expect(qualityPrior({ rating: 5, userRatingCount: 2 })).toBeLessThan(qualityPrior({ rating: 5, userRatingCount: 2000 }) as number);
    expect(qualityPrior({ rating: 5, userRatingCount: 1e6 })).toBeCloseTo(1, 2);
  });
  it("scores special places", () => {
    expect(specialness({ priceLevel: 1, tags: {} })).toBe(0);
    expect(specialness({ priceLevel: 4, tags: { occasions: ["special"] } })).toBe(1);
  });
  it("predicts a score with calibration and clamps it", () => {
    expect(predictScore(0.5, null, 0)).toBe(5.5);
    expect(predictScore(1, 1, 5)).toBe(10);
    expect(predictScore(0.5, null, -1)).toBe(4.5);
  });
});

describe("rankPlaces", () => {
  it("Something new: skips places you've been and puts liked cuisine first", () => {
    const order = ids(input());
    expect(order).not.toContain("ramen-been");
    expect(order[0]).toBe("ramen-new");
    expect(order.at(-1)).toBe("steak-new");
  });

  it("Go-to: only places you've been and liked, scored with your own score", () => {
    const recs = rankPlaces(input({ filter: "goto" }));
    expect(recs.map((r) => r.place.id)).toEqual(["ramen-been"]);
    expect(recs[0].score).toBe(9.1);
    expect(recs[0].signals).toMatchObject({ visited: true, novelty: 0 });
  });

  it("all: keeps go-tos but never a place you disliked", () => {
    expect(ids(input({ filter: "all" }))).toContain("ramen-been");
    expect(ids(input({ filter: "all" }))).not.toContain("steak-been");
  });

  it("drops places outside the radius", () => {
    expect(ids(input({ candidates: [place("far", ["ramen"], 10)] }))).toEqual([]);
  });

  it("boosts the want list", () => {
    const a = place("a", ["mexican"]);
    const b = place("b", ["mexican"]);
    expect(ids(input({ candidates: [a, b], wanted: new Set(["b"]) }))).toEqual(["b", "a"]);
  });

  it("Travel weighs crowd rating more than Near me does", () => {
    const liked = place("liked", ["ramen"], 0.5, { tags: { rating: 3.6, userRatingCount: 900 } });
    const acclaimed = place("acclaimed", ["mexican"], 0.5, { tags: { rating: 4.9, userRatingCount: 3000 } });
    const both = { candidates: [liked, acclaimed] };
    const nearGap = rankPlaces(input(both)).map((r) => r.place.id);
    const travel = rankPlaces(input({ ...both, ctx: { mode: "travel" } })).map((r) => r.place.id);
    expect(nearGap[0]).toBe("liked");
    expect(travel[0]).toBe("acclaimed");
  });

  it("Splurge lifts expensive special places and ignores price dislikes", () => {
    const cheap = place("cheap", ["mexican"], 0.5, { priceLevel: 1 });
    const fancy = place("fancy", ["mexican"], 0.5, { priceLevel: 4, tags: { occasions: ["special"] } });
    expect(ids(input({ candidates: [cheap, fancy] }))[0]).toBe("cheap");
    expect(ids(input({ candidates: [cheap, fancy], ctx: { mode: "splurge" } }))[0]).toBe("fancy");
  });

  it("Stretch: only untried cuisines, neighbours of liked ones first", () => {
    const order = ids(input({ ctx: { mode: "stretch" } }));
    expect(order).toEqual(["korean-new", "taco-new"]);
  });

  it("applies calibration to new places only", () => {
    const up = rankPlaces(input({ calibration: 1, filter: "all" }));
    const base = rankPlaces(input({ filter: "all" }));
    const score = (rs: typeof up, id: string) => rs.find((r) => r.place.id === id)?.score as number;
    expect(score(up, "ramen-new") - score(base, "ramen-new")).toBeCloseTo(1, 5);
    expect(score(up, "ramen-been")).toBe(score(base, "ramen-been"));
  });

  it("returns each place once", () => {
    const p = place("dup", ["mexican"]);
    expect(ids(input({ candidates: [p, p] }))).toEqual(["dup"]);
  });
});
