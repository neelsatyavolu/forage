import { describe, expect, it } from "vitest";
import type { Place, PlaceTags } from "../types";
import { buildDeck, interleave, knownScore, likelihood } from "./deck";

const AT = { lat: 37.78, lng: -122.42 };
// About 111 m of latitude per 0.001 degree.
const place = (id: string, northM: number, tags: PlaceTags = { attributes: ["restaurant"] }, cuisine: string[] = []): Place => ({
  id, source: "osm", sourceId: `node/${id}`, googlePlaceId: null, name: id, lat: AT.lat + northM / 111_195, lng: AT.lng,
  address: null, city: null, country: null, cuisine, priceLevel: null, tags, updatedAt: 0,
});

describe("knownScore", () => {
  it("adds up the free signals and caps at 1", () => {
    expect(knownScore(place("a", 0, {}), 0)).toBe(0);
    expect(knownScore(place("a", 0, { brand: "Peet's" }), 0)).toBeCloseTo(0.35);
    expect(knownScore(place("a", 0, { wikidata: "Q1", openingHours: "24/7", website: "x" }, ["coffee"]), 0)).toBeCloseTo(0.75);
    expect(knownScore(place("a", 0, { brand: "b", wikidata: "Q", openingHours: "x", website: "x" }, ["c"]), 10)).toBe(1);
  });

  it("counts Forage users only from three up", () => {
    expect(knownScore(place("a", 0, {}), 2)).toBe(0);
    expect(knownScore(place("a", 0, {}), 3)).toBeCloseTo(0.15);
    expect(knownScore(place("a", 0, {}), 9)).toBeCloseTo(0.25);
  });
});

describe("likelihood", () => {
  it("falls with distance and rises with how known a place is", () => {
    expect(likelihood(0, 0)).toBeCloseTo(0.6);
    expect(likelihood(0.6, 0)).toBeCloseTo(0.6 / Math.E);
    expect(likelihood(1, 1)).toBeGreaterThan(likelihood(1, 0));
  });
});

describe("interleave", () => {
  it("allows at most three in a row with one key, otherwise keeping order", () => {
    const keys = ["bar", "bar", "bar", "bar", "bar", "cafe", "cafe"];
    expect(interleave(keys, (k) => k)).toEqual(["bar", "bar", "bar", "cafe", "bar", "bar", "cafe"]);
  });

  it("gives up gracefully when nothing else is left", () => {
    expect(interleave(["a", "a", "a", "a"], (k) => k)).toEqual(["a", "a", "a", "a"]);
    expect(interleave([], (k: string) => k)).toEqual([]);
  });
});

describe("buildDeck", () => {
  const places = [
    place("far", 1400),
    place("near", 50),
    place("chain", 400, { attributes: ["fast food"], brand: "Chain", wikidata: "Q9" }),
    place("mid", 400),
    place("gone", 10),
  ];

  it("ranks likely visits first, drops excluded places, and fills each tile", () => {
    const deck = buildDeck({ at: AT, places, exclude: new Set(["gone"]), crowd: new Map(), limit: 3 });
    expect(deck.places.map((d) => d.place.id)).toEqual(["near", "chain", "mid"]);
    expect(deck.hasMore).toBe(true);
    expect(deck.places[1]).toMatchObject({ guessedOccasion: "quick", kind: "Fast Food" });
    expect(deck.places[0].distanceKm).toBeCloseTo(0.05, 2);
  });

  it("lets a crowd of Forage users lift a place", () => {
    const deck = buildDeck({ at: AT, places, exclude: new Set(["gone", "near", "chain"]), crowd: new Map([["far", 5]]), limit: 6 });
    expect(deck.places.map((d) => d.place.id)).toEqual(["mid", "far"]);
    expect(deck.hasMore).toBe(false);
  });

  it("keeps the first page from being all one amenity", () => {
    const bars = ["b1", "b2", "b3", "b4"].map((id, i) => place(id, 10 + i, { attributes: ["bar"] }));
    const deck = buildDeck({ at: AT, places: [...bars, place("cafe", 500, { attributes: ["cafe"] })], exclude: new Set(), crowd: new Map(), limit: 5 });
    expect(deck.places.map((d) => d.place.id)).toEqual(["b1", "b2", "b3", "cafe", "b4"]);
  });
});
