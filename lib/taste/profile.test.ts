import { describe, expect, it } from "vitest";
import { insertVisit } from "../db/visits";
import { saveScores } from "../db/scores";
import type { Place, Visit } from "../types";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import { loadHistory } from "./history";
import { computeWeights, placeValue, recency, tasteSimilarity, topWeights, visitScore, visitValue, type HistoryItem } from "./profile";

const NOW = Date.parse("2026-11-11T12:00:00Z");

const place = (id: string, cuisine: string[], tags: Place["tags"] = {}, priceLevel: number | null = 2): Place => ({
  id, source: "osm", sourceId: id, googlePlaceId: null, name: id, lat: 0, lng: 0, address: null, city: null, country: null, cuisine, priceLevel, tags, updatedAt: 0,
});

const visit = (placeId: string, reaction: Visit["reaction"], visitedOn = "2026-11-01", extra: Partial<Visit> = {}): Visit => ({
  id: `${placeId}-${visitedOn}`, userId: USER_A, placeId, visitedOn, reaction, occasion: "casual", dishes: [], note: null, createdAt: 0, ...extra,
});

const item = (p: Place, visits: Visit[], scores: HistoryItem["scores"] = {}): HistoryItem => ({ place: p, visits, scores });

describe("visit value and score", () => {
  it("uses the reaction alone without a fitted score", () => {
    expect(visitValue({ reaction: "loved", occasion: "casual" }, {})).toBe(1);
    expect(visitScore({ reaction: "disliked", occasion: "casual" }, {})).toBe(3);
  });
  it("blends in the fitted score for the visit's occasion", () => {
    expect(visitValue({ reaction: "loved", occasion: "casual" }, { casual: 5 })).toBe(0.5);
    expect(visitScore({ reaction: "loved", occasion: "casual" }, { casual: 7.2, special: 9 })).toBe(7.2);
  });
  it("weights the latest visit most", () => {
    const p = place("a", []);
    expect(placeValue(item(p, [visit("a", "disliked", "2026-11-01"), visit("a", "loved", "2026-01-01")]))).toBeCloseTo(-0.4);
    expect(placeValue(item(p, []))).toBe(0);
  });
});

describe("computeWeights", () => {
  it("makes liked tags positive and disliked tags negative", () => {
    const w = computeWeights(
      [
        item(place("ramen", ["ramen"], { vibe: ["lively"] }), [visit("ramen", "loved", "2026-11-01", { dishes: ["tonkotsu"], note: "spicy and cozy" })]),
        item(place("steak", ["steak_house"], {}, 4), [visit("steak", "disliked")]),
      ],
      NOW,
    );
    expect(w["cuisine:ramen"]).toBeGreaterThan(0.3);
    expect(w["dish:tonkotsu"]).toBeGreaterThan(0.3);
    expect(w["attr:spicy"]).toBeGreaterThan(0.3);
    expect(w["cuisine:steak_house"]).toBeLessThan(-0.3);
    expect(w["price:4"]).toBeLessThan(0);
    expect(Object.values(w).every((x) => x >= -1 && x <= 1)).toBe(true);
  });

  it("fades old visits", () => {
    expect(recency("2025-11-11", NOW)).toBeCloseTo(0.5, 2);
    const fresh = computeWeights([item(place("a", ["thai"]), [visit("a", "loved", "2026-11-10")])], NOW);
    const old = computeWeights([item(place("a", ["thai"]), [visit("a", "loved", "2023-11-10")])], NOW);
    expect(fresh["cuisine:thai"]).toBeGreaterThan(old["cuisine:thai"] * 3);
  });

  it("is empty with no history", () => {
    expect(computeWeights([], NOW)).toEqual({});
  });
});

describe("tasteSimilarity", () => {
  const w = { "cuisine:ramen": 0.8, "price:4": -0.6, "vibe:scene": -0.5 };
  it("is 0.5 with no known tags and moves with weights", () => {
    expect(tasteSimilarity([], w)).toBe(0.5);
    expect(tasteSimilarity(["cuisine:ramen", "price:2"], w)).toBeGreaterThan(0.7);
    expect(tasteSimilarity(["price:4", "vibe:scene"], w)).toBeLessThan(0.3);
  });
  it("can skip a tag kind", () => {
    expect(tasteSimilarity(["price:4"], w, ["price"])).toBe(0.5);
  });
});

describe("topWeights", () => {
  it("splits likes and dislikes, strongest first", () => {
    expect(topWeights({ a: 0.9, b: 0.2, c: -0.7, d: -0.01, e: -0.3 }, 1)).toEqual({ likes: [["a", 0.9]], dislikes: [["c", -0.7]] });
  });
});

describe("loadHistory", () => {
  it("groups the user's visits and scores by place, ignoring other users", async () => {
    const db = await freshDb();
    const a = await addPlace(db, { sourceId: "node/1" });
    const b = await addPlace(db, { sourceId: "node/2", name: "Other" });
    await insertVisit(db, USER_A, { placeId: a.id, visitedOn: "2026-10-01", reaction: "fine", occasion: "casual", dishes: [], note: null }, 1);
    await insertVisit(db, USER_A, { placeId: a.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "casual", dishes: [], note: null }, 2);
    await insertVisit(db, USER_B, { placeId: b.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "casual", dishes: [], note: null }, 3);
    await saveScores(db, USER_A, "casual", [{ placeId: a.id, score: 8 }], 4);
    const history = await loadHistory(db, USER_A);
    expect(history).toHaveLength(1);
    expect(history[0].place.id).toBe(a.id);
    expect(history[0].visits.map((v) => v.visitedOn)).toEqual(["2026-11-01", "2026-10-01"]);
    expect(history[0].scores).toEqual({ casual: 8 });
  });
});
