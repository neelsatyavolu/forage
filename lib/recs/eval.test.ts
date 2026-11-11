import { describe, expect, it } from "vitest";
import { computeWeights, type HistoryItem } from "../taste/profile";
import type { Place, Reaction, RecContext, Visit } from "../types";
import { rankPlaces } from "./rank";

// Offline eval: synthetic users with hidden tastes log visits in a synthetic
// city. For each user, 20% of the places they loved are held out; the rest
// build the profile. Across 40 users, held-out places must land in the top
// third of the candidates the ranking sees (Near me mode, so distance and crowd rating,
// which this persona ignores, still pull on the order).

const NOW = Date.parse("2026-11-11T12:00:00Z");
const CENTER = { lat: 37.77, lng: -122.42 };

/** Small deterministic RNG (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISHES: Record<string, string[]> = {
  ramen: ["tonkotsu", "shoyu ramen", "gyoza"], thai: ["khao soi", "larb", "pad see ew"], mexican: ["al pastor", "mole", "elote"],
  italian: ["cacio e pepe", "burrata", "tiramisu"], indian: ["dosa", "biryani", "dal"], korean: ["bibimbap", "kimchi jjigae", "galbi"],
  burger: ["smash burger", "fries", "milkshake"], ethiopian: ["injera", "doro wat", "tibs"], french: ["steak frites", "escargot", "onion soup"],
  sushi: ["omakase", "hand roll", "nigiri"], vietnamese: ["pho", "banh mi", "bun bo hue"], lebanese: ["mezze", "shawarma", "hummus"],
};
const CUISINES = Object.keys(DISHES);
const VIBES = ["casual", "lively", "quiet", "upscale", "cozy", "scene"];

function city(rand: () => number, n: number): Place[] {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    const cuisine = pick(CUISINES);
    const angle = rand() * 2 * Math.PI;
    const km = Math.sqrt(rand()) * 3;
    return {
      id: `p${i}`, source: "osm", sourceId: `node/${i}`, googlePlaceId: null, name: `Place ${i}`,
      lat: CENTER.lat + (km / 111.32) * Math.sin(angle), lng: CENTER.lng + (km / 88) * Math.cos(angle),
      address: null, city: "Testville", country: "US", cuisine: [cuisine], priceLevel: 1 + Math.floor(rand() * 4),
      tags: { dishes: [pick(DISHES[cuisine]), pick(DISHES[cuisine])], vibe: [pick(VIBES)], rating: 3.6 + rand() * 1.2, userRatingCount: Math.floor(rand() * 800) },
      updatedAt: 0,
    } satisfies Place;
  });
}

type Persona = { likes: string[]; dislikes: string[]; likedVibe: string; dislikedVibe: string };

function utility(p: Persona, place: Place, rand: () => number): number {
  const c = place.cuisine[0];
  const v = (place.tags.vibe ?? [])[0];
  return (p.likes.includes(c) ? 1 : 0) - (p.dislikes.includes(c) ? 1 : 0) + (v === p.likedVibe ? 0.5 : 0) - (v === p.dislikedVibe ? 0.5 : 0) + (rand() - 0.5) * 0.3;
}

function simulate(seed: number) {
  const rand = rng(seed);
  const places = city(rand, 240);
  const shuffled = [...CUISINES].sort(() => rand() - 0.5);
  const persona: Persona = { likes: shuffled.slice(0, 3), dislikes: shuffled.slice(3, 5), likedVibe: VIBES[seed % 6], dislikedVibe: VIBES[(seed + 3) % 6] };
  const visited = [...places].sort(() => rand() - 0.5).slice(0, 60);
  const history: HistoryItem[] = visited.map((place, i) => {
    const u = utility(persona, place, rand);
    const reaction: Reaction = u >= 0.9 ? "loved" : u <= -0.5 ? "disliked" : "fine";
    const day = new Date(NOW - (i * 9 + 1) * 86_400_000).toISOString().slice(0, 10);
    const visit: Visit = { id: `v${i}`, userId: "u", placeId: place.id, visitedOn: day, reaction, occasion: "casual", dishes: place.tags.dishes ?? [], note: null, createdAt: 0 };
    return { place, visits: [visit], scores: {} };
  });
  const loved = history.filter((h) => h.visits[0].reaction === "loved");
  // Hold out every fifth loved place, but never the last loved place of its
  // cuisine: with no evidence at all for that cuisine, no ranking could find it.
  const heldOut = new Set<string>();
  loved.forEach((h, i) => {
    const c = h.place.cuisine[0];
    const othersLeft = loved.some((o) => o !== h && o.place.cuisine[0] === c && !heldOut.has(o.place.id));
    if (i % 5 === 0 && othersLeft) heldOut.add(h.place.id);
  });
  const training = history.filter((h) => !heldOut.has(h.place.id));
  const ctx: RecContext = { ...CENTER, radiusKm: 5, mode: "near" };
  const ranked = rankPlaces({ candidates: places, history: training, weights: computeWeights(training, NOW), ctx, filter: "new", wanted: new Set(), calibration: 0 });
  const positions = [...heldOut].map((id) => ranked.findIndex((r) => r.place.id === id));
  return { positions, candidates: ranked.length };
}

describe("offline eval: held-out loved places", () => {
  const results = Array.from({ length: 40 }, (_, i) => simulate(i + 1));
  const ratios = results.flatMap((r) => r.positions.map((p) => p / r.candidates));

  it("finds every held-out place among the candidates", () => {
    expect(ratios.length).toBeGreaterThan(60);
    expect(ratios.every((x) => x >= 0)).toBe(true);
  });

  it("ranks at least 90% of held-out loved places in the top third (random would be 33%)", () => {
    expect(ratios.filter((x) => x < 1 / 3).length / ratios.length).toBeGreaterThanOrEqual(0.9);
  });

  it("puts the median held-out place in the top 15% and none in the bottom half", () => {
    const sorted = [...ratios].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(0.15);
    expect(Math.max(...ratios)).toBeLessThan(0.5);
  });
});
