import { describe, expect, it } from "vitest";
import { BAND_PRIOR, fitScores } from "./bradley-terry";

const beat = (winnerPlaceId: string, loserPlaceId: string) => ({ winnerPlaceId, loserPlaceId });
const order = (scores: Map<string, number>) => [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

describe("fitScores", () => {
  it("puts places with no comparisons at their band prior", () => {
    const s = fitScores([{ id: "a", reaction: "loved" }, { id: "b", reaction: "fine" }, { id: "c", reaction: "disliked" }], []);
    expect(s.get("a")).toBe(BAND_PRIOR.loved);
    expect(s.get("b")).toBe(BAND_PRIOR.fine);
    expect(s.get("c")).toBe(BAND_PRIOR.disliked);
  });

  it("moves one comparison's winner up and loser down by the same amount", () => {
    const s = fitScores([{ id: "a", reaction: "loved" }, { id: "b", reaction: "loved" }], [beat("b", "a")]);
    const up = s.get("b")! - BAND_PRIOR.loved;
    const down = BAND_PRIOR.loved - s.get("a")!;
    expect(up).toBeGreaterThan(0.2);
    expect(up).toBeCloseTo(down, 2);
  });

  it("recovers a chain ordering within a band", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id, reaction: "loved" as const }));
    const s = fitScores(items, [beat("a", "b"), beat("b", "c"), beat("c", "d")]);
    expect(order(s)).toEqual(["a", "b", "c", "d"]);
  });

  it("recovers a full round-robin ordering", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    const comps = ids.flatMap((w, i) => ids.slice(i + 1).map((l) => beat(w, l)));
    const s = fitScores(ids.map((id) => ({ id, reaction: "fine" as const })), comps);
    expect(order(s)).toEqual(ids);
  });

  it("lets repeated wins beat the band prior", () => {
    const items = [{ id: "fine", reaction: "fine" as const }, { id: "loved", reaction: "loved" as const }];
    const once = fitScores(items, [beat("fine", "loved")]);
    expect(once.get("loved")!).toBeGreaterThan(once.get("fine")!);
    const many = fitScores(items, Array.from({ length: 12 }, () => beat("fine", "loved")));
    expect(many.get("fine")!).toBeGreaterThan(many.get("loved")!);
  });

  it("ignores comparisons with places that are not items", () => {
    const s = fitScores([{ id: "a", reaction: "loved" }], [beat("a", "gone"), beat("gone", "a")]);
    expect(s.get("a")).toBe(BAND_PRIOR.loved);
  });

  it("keeps every score in 0-10 even with lopsided data", () => {
    const items = [{ id: "top", reaction: "loved" as const }, { id: "low", reaction: "disliked" as const }];
    const s = fitScores(items, Array.from({ length: 200 }, () => beat("top", "low")));
    for (const v of s.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("gives the same answer whatever the comparison order", () => {
    const items = ["a", "b", "c"].map((id) => ({ id, reaction: "loved" as const }));
    const comps = [beat("a", "b"), beat("c", "b"), beat("a", "c")];
    expect(fitScores(items, comps)).toEqual(fitScores(items, [...comps].reverse()));
  });

  it("returns nothing for no items", () => {
    expect(fitScores([], [beat("a", "b")]).size).toBe(0);
  });

  it("starts a rated place at its rating, with no comparisons", () => {
    const s = fitScores([{ id: "a", reaction: "loved", rating: 9 }, { id: "b", reaction: "fine", rating: 5 }, { id: "c", reaction: "fine", rating: null }], []);
    expect(s.get("a")).toBe(9);
    expect(s.get("b")).toBe(5);
    expect(s.get("c")).toBe(BAND_PRIOR.fine);
  });

  it("moves a rated place less than an unrated one for the same comparison", () => {
    const rated = fitScores([{ id: "a", reaction: "loved", rating: 8.5 }, { id: "b", reaction: "loved", rating: 8.5 }], [beat("a", "b")]);
    const unrated = fitScores([{ id: "a", reaction: "loved" }, { id: "b", reaction: "loved" }], [beat("a", "b")]);
    expect(rated.get("a")! - 8.5).toBeGreaterThan(0);
    expect(rated.get("a")! - 8.5).toBeLessThan(unrated.get("a")! - 8.5);
  });

  it("reproduces the unrated fit exactly when rating is null", () => {
    const comps = [beat("a", "b"), beat("b", "c")];
    const plain = fitScores(["a", "b", "c"].map((id) => ({ id, reaction: "fine" as const })), comps);
    const nulls = fitScores(["a", "b", "c"].map((id) => ({ id, reaction: "fine" as const, rating: null })), comps);
    expect(nulls).toEqual(plain);
  });
});
