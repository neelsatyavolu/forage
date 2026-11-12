import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../lib/db/client";
import { tileTimes } from "../../lib/db/osm-tiles";
import { getPlaceBySource, setGooglePlaceId } from "../../lib/db/places";
import { insertPrediction } from "../../lib/db/predictions";
import { insertComparison, saveScores } from "../../lib/db/scores";
import { addSkip } from "../../lib/db/skips";
import { insertVisit } from "../../lib/db/visits";
import { addWant } from "../../lib/db/want";
import { tilesAround } from "../../lib/places/tiles";
import { addPlace, freshDb, placeInput, USER_A } from "../../test/db";
import { importLines } from "./run";
import { BATCH, markImported, placeReferences, pruneMissing, saveBatch, tileOf } from "./store";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const feature = (id: number, name: string, lng = -71.41, lat = 41.82, extra: Record<string, string> = {}) =>
  JSON.stringify({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { "@type": "node", "@id": id, amenity: "cafe", name, ...extra } });

async function* lines(list: string[]) {
  yield* list;
}

const count = async () => Number((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM places"))[0].n);

describe("saveBatch", () => {
  it("inserts new places, skips unchanged ones and updates changed ones", async () => {
    const a = placeInput({ sourceId: "node/1", tags: { attributes: ["cafe"] } });
    const b = placeInput({ sourceId: "node/2", name: "Other", tags: { attributes: ["cafe"] } });
    expect(await saveBatch(db, [a, b], 1000)).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(await saveBatch(db, [a, b], 2000)).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect((await getPlaceBySource(db, "osm", "node/1"))?.updatedAt).toBe(1000);
    expect(await saveBatch(db, [{ ...a, name: "Renamed" }, b], 3000)).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
    expect((await getPlaceBySource(db, "osm", "node/1"))?.name).toBe("Renamed");
  });

  it("keeps what's already stored (Google id, AI tags), like an Overpass refill", async () => {
    const stored = await addPlace(db, { sourceId: "node/9", tags: { dishes: ["dumplings"], attributes: ["cafe"] } });
    await setGooglePlaceId(db, stored.id, "g-1", 1500);
    const counts = await saveBatch(db, [placeInput({ sourceId: "node/9", tags: { attributes: ["cafe"] } })], 2000);
    expect(counts.unchanged).toBe(1);
    const after = await getPlaceBySource(db, "osm", "node/9");
    expect(after).toMatchObject({ id: stored.id, googlePlaceId: "g-1", tags: { dishes: ["dumplings"], attributes: ["cafe"] } });
  });
});

describe("importLines", () => {
  it("batches, dedupes repeats across the run, collects tiles and runs the check", async () => {
    const n = BATCH * 2 + 10;
    const input = Array.from({ length: n }, (_, i) => feature(i + 1, `Cafe ${i}`, -71.41 + i * 0.0001));
    let checks = 0;
    const seen = new Set<string>();
    const ctx = { q: db, now: 1000, seen, check: async () => void checks++, checkEvery: 1 };
    const first = await importLines(ctx, lines([...input, input[0], "garbage", feature(99_999, "")]));
    expect(first).toMatchObject({ features: n + 3, places: n, repeats: 1, inserted: n, updated: 0, unchanged: 0 });
    expect(checks).toBe(3);
    expect(await count()).toBe(n);
    expect(first.tiles).toEqual(new Set(input.map((_, i) => tileOf({ lat: 41.82, lng: -71.41 + i * 0.0001 }))));
    const second = await importLines({ q: db, now: 2000, seen: new Set() }, lines(input));
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: n });
  });

  it("stops when the check throws", async () => {
    const input = Array.from({ length: BATCH + 1 }, (_, i) => feature(i + 1, `C${i}`));
    const ctx = { q: db, now: 1, seen: new Set<string>(), checkEvery: 1, check: async () => { throw new Error("too big"); } };
    await expect(importLines(ctx, lines(input))).rejects.toThrow("too big");
  });
});

describe("tiles", () => {
  it("uses the nearby-search tile grid and marks tiles fetched", async () => {
    const at = { lat: 41.8239, lng: -71.4128 };
    expect(tileOf(at)).toBe(tilesAround(at, 0)[0]);
    expect(tilesAround(at, 1)).toContain(tileOf(at));
    const tiles = ["2091:-3571", "2091:-3570", "2091:-3571"];
    expect(await markImported(db, tiles, 5000)).toBe(2);
    expect(await tileTimes(db, tiles)).toEqual(new Map([["2091:-3571", 5000], ["2091:-3570", 5000]]));
  });
});

describe("pruneMissing", () => {
  it("finds every table that refers to places", async () => {
    const tables = (await placeReferences(db)).map((r) => r.table);
    for (const t of ["visits", "want_list", "place_scores", "predictions", "comparisons", "place_skips"]) expect(tables).toContain(t);
  });

  it("deletes only unseen, unreferenced OSM places inside the run's tiles", async () => {
    const at = (i: number) => ({ lat: 41.82, lng: -71.41 + i * 0.00001 });
    const mk = (id: string, i: number, source: "osm" | "manual" = "osm") => addPlace(db, { source, sourceId: id, ...at(i) });
    const seenPlace = await mk("node/1", 1);
    const gone = await mk("node/2", 2);
    const manual = await mk("manual-1", 3, "manual");
    const outside = await addPlace(db, { sourceId: "node/3", lat: 40.7, lng: -74.0 });
    const referenced = await Promise.all(["visit", "want", "score", "prediction", "winner", "loser", "skip"].map((k, i) => mk(`node/${k}`, 10 + i)));
    const [visit, want, score, prediction, winner, loser, skip] = referenced;
    await insertVisit(db, USER_A, { placeId: visit.id, visitedOn: "2026-10-01", reaction: "loved", occasion: "casual", dishes: [], note: null }, 1);
    await addWant(db, USER_A, want.id, "manual", 1);
    await saveScores(db, USER_A, "casual", [{ placeId: score.id, score: 7 }], 1);
    await insertPrediction(db, USER_A, prediction.id, 6, 6, 1);
    await insertComparison(db, USER_A, { winnerPlaceId: winner.id, loserPlaceId: loser.id, occasion: "casual" }, 1);
    await addSkip(db, USER_A, skip.id, 1);

    const tiles = new Set([tileOf(at(1))]);
    expect(await pruneMissing(db, tiles, new Set(["node/1"]))).toBe(1);
    const left = new Set((await db.query<{ id: string }>("SELECT id FROM places")).map((r) => r.id));
    expect(left.has(gone.id)).toBe(false);
    for (const p of [seenPlace, manual, outside, ...referenced]) expect(left.has(p.id)).toBe(true);
    expect(await pruneMissing(db, tiles, new Set(["node/1"]))).toBe(0);
  });
});
