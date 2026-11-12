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
  visits: [{ id: `v-${p.id}`, userId: "u", placeId: p.id, visitedOn: "2026-11-01", reaction, occasion: "casual", rating: null, dated: true, dishes: [], note: null, createdAt: 0 }],
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
    expect(qualityPrior(undefined)).toBeNull();
    expect(qualityPrior({ rating: 9, count: 10 })).toBeNull();
    expect(qualityPrior({ rating: 5, count: 2 })).toBeLessThan(qualityPrior({ rating: 5, count: 2000 }) as number);
    expect(qualityPrior({ rating: 5, count: 1e6 })).toBeCloseTo(1, 2);
    expect(qualityPrior({ rating: 5, count: null })).toBe(0.5);
  });
  it("scores special places", () => {
    expect(specialness({ priceLevel: 1, tags: {} })).toBe(0);
    expect(specialness({ priceLevel: 4, tags: { occasions: ["special"] } })).toBe(1);
  });
  it("ignores rating-like keys in stored tags; only live ratings count", () => {
    const tagged = place("tagged", ["mexican"], 0.5, { tags: { rating: 4.9, userRatingCount: 3000 } });
    expect(rankPlaces(input({ candidates: [tagged] }))[0].signals.quality).toBeNull();
    expect(rankPlaces(input({ candidates: [tagged], ratings: new Map([["tagged", { rating: 4.9, count: 3000 }]]) }))[0].signals.quality).toBeGreaterThan(0.9);
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
    const liked = place("liked", ["ramen"], 0.5);
    const acclaimed = place("acclaimed", ["mexican"], 0.5);
    const ratings = new Map([["liked", { rating: 3.6, count: 900 }], ["acclaimed", { rating: 4.9, count: 3000 }]]);
    const both = { candidates: [liked, acclaimed], ratings };
    const nearGap = rankPlaces(input(both)).map((r) => r.place.id);
    const travel = rankPlaces(input({ ...both, ctx: { mode: "travel" } })).map((r) => r.place.id);
    expect(nearGap[0]).toBe("liked");
    expect(travel[0]).toBe("acclaimed");
  });

  it("Splurge keeps only special places when there are enough of them", () => {
    const cheap = place("cheap", ["mexican"], 0.2, { priceLevel: 1 });
    const fancy = [1, 2, 3, 4, 5].map((i) => place(`fancy${i}`, ["mexican"], 1, { priceLevel: i % 2 ? 4 : null, tags: i % 2 ? {} : { occasions: ["night_out"] } }));
    const splurge = ids(input({ candidates: [cheap, ...fancy], ctx: { mode: "splurge" } }));
    expect(splurge).toHaveLength(5);
    expect(splurge).not.toContain("cheap");
    expect(ids(input({ candidates: [cheap, ...fancy] }))).toContain("cheap");
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

describe("imported Lodestar preferences", () => {
  const meaty = place("meaty", ["burger"], 0.5, { tags: { dietNo: ["vegetarian"] } });
  const pricey = place("pricey", ["sushi"], 0.5, { priceLevel: 4 });
  const unknownPrice = place("unknown-price", ["sushi"], 0.5, { priceLevel: null });
  const candidates = [meaty, pricey, unknownPrice, place("cheap", ["sushi"], 0.5, { priceLevel: 1 })];
  const seed = { cuisines: [], dietary: ["vegetarian"], priceCeiling: 2 };

  it("hides new places marked as not serving a needed diet, in every mode", () => {
    for (const mode of ["near", "travel", "splurge"] as const) expect(ids(input({ candidates, seed, ctx: { mode } }))).not.toContain("meaty");
    expect(ids(input({ candidates }))).toContain("meaty");
  });

  it("caps price in Near me only, keeping places with no known price", () => {
    expect(ids(input({ candidates, seed })).sort()).toEqual(["cheap", "unknown-price"]);
    expect(ids(input({ candidates, seed, ctx: { mode: "splurge" } }))).toContain("pricey");
  });

  it("never hides places the user has been to", () => {
    const beenMeaty = been(meaty, "loved");
    expect(ids(input({ candidates: [meaty], history: [beenMeaty], filter: "goto", seed }))).toEqual(["meaty"]);
  });
});
