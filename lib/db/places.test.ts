import { beforeEach, describe, expect, it } from "vitest";
import { addPlace, freshDb, placeInput } from "../../test/db";
import type { Db } from "./client";
import { markTiles, tileTimes } from "./osm-tiles";
import { boxAround, deletePlace, findPlacesByName, getPlace, getPlaceBySource, getPlaces, getPlacesBySource, placesInBox, placesNearest, setGooglePlaceId, upsertPlace, upsertPlaces, upsertPlacesBatch } from "./places";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("places", () => {
  it("round-trips every field", async () => {
    const place = await addPlace(db);
    expect(place).toMatchObject({ ...placeInput(), updatedAt: 1000 });
    expect(await getPlace(db, place.id)).toEqual(place);
    expect(await getPlaceBySource(db, "osm", "node/1")).toEqual(place);
  });

  it("refreshes by source id, keeping the id and a known Google id", async () => {
    const first = await upsertPlace(db, placeInput({ googlePlaceId: "g1" }), 1);
    const second = await upsertPlace(db, placeInput({ name: "Mian SF", priceLevel: null }), 2);
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ name: "Mian SF", priceLevel: null, googlePlaceId: "g1", updatedAt: 2 });
    await setGooglePlaceId(db, first.id, "g2", 3);
    expect((await getPlace(db, first.id))?.googlePlaceId).toBe("g2");
  });

  it("finds places by id list, box and name", async () => {
    const [a, b] = await upsertPlaces(db, [placeInput(), placeInput({ sourceId: "node/2", name: "Far 100%", lat: 40.7, lng: -74 })], 1);
    expect((await getPlaces(db, [a.id, b.id])).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(await getPlaces(db, [])).toEqual([]);
    expect((await placesInBox(db, boxAround(37.77, -122.42, 2))).map((p) => p.id)).toEqual([a.id]);
    expect((await findPlacesByName(db, "mian")).map((p) => p.id)).toEqual([a.id]);
    expect((await findPlacesByName(db, "100%")).map((p) => p.id)).toEqual([b.id]);
    expect(await findPlacesByName(db, "_")).toEqual([]);
  });

  it("deletes", async () => {
    const place = await addPlace(db);
    expect(await deletePlace(db, place.id)).toBe(true);
    expect(await getPlace(db, place.id)).toBeNull();
    expect(await deletePlace(db, place.id)).toBe(false);
  });

  it("refuses an out-of-range price level", async () => {
    await expect(upsertPlace(db, placeInput({ priceLevel: 5 }), 1)).rejects.toThrow();
  });
});

describe("boxAround", () => {
  it("is about 1 degree of latitude per 111 km and wider in longitude away from the equator", () => {
    const box = boxAround(60, 10, 111.32);
    expect(box.maxLat - 60).toBeCloseTo(1);
    expect(box.maxLng - 10).toBeCloseTo(2);
  });
});

describe("batch place queries", () => {
  it("upserts many in one statement, keeping ids and Google ids, and orders by nearness", async () => {
    const first = await upsertPlace(db, placeInput({ googlePlaceId: "g1" }), 1);
    const saved = await upsertPlacesBatch(db, [placeInput({ name: "Mian 2", cuisine: [] }), placeInput({ sourceId: "node/2", lat: 37.78 })], 2);
    expect(saved.find((p) => p.sourceId === "node/1")).toMatchObject({ id: first.id, name: "Mian 2", googlePlaceId: "g1", cuisine: [], updatedAt: 2 });
    expect(saved.find((p) => p.sourceId === "node/2")?.cuisine).toEqual(["chinese", "noodles"]);
    expect(await upsertPlacesBatch(db, [], 3)).toEqual([]);
    expect((await getPlacesBySource(db, "osm", ["node/2", "node/x"])).map((p) => p.sourceId)).toEqual(["node/2"]);
    expect(await getPlacesBySource(db, "osm", [])).toEqual([]);
    const near = await placesNearest(db, boxAround(37.78, -122.42, 3), { lat: 37.78, lng: -122.42 });
    expect(near.map((p) => p.sourceId)).toEqual(["node/2", "node/1"]);
    expect(await placesNearest(db, boxAround(37.78, -122.42, 3), { lat: 37.78, lng: -122.42 }, 1)).toHaveLength(1);
  });

  it("records tile fetch times", async () => {
    expect(await tileTimes(db, ["1:1"])).toEqual(new Map());
    await markTiles(db, ["1:1", "1:2", "1:1"], 1000);
    await markTiles(db, ["1:2"], 2000);
    expect(await tileTimes(db, ["1:1", "1:2", "9:9"])).toEqual(new Map([["1:1", 1000], ["1:2", 2000]]));
    expect(await tileTimes(db, [])).toEqual(new Map());
    await markTiles(db, [], 3000);
  });
});
