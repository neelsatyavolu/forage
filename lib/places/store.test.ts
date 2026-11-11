import { describe, expect, it, vi } from "vitest";
import { addPlace, freshDb, placeInput } from "@/test/db";
import { getPlace } from "../db/places";
import { byDistance, distanceKm } from "./geo";
import type { GoogleClient } from "./google";
import { mergeInput } from "./merge";
import { PlacesError } from "./errors";
import { liveDetails, liveRatings, nearbyStored, saveFetched, searchStored } from "./store";

const SF = { lat: 37.77, lng: -122.42 };

describe("geo", () => {
  it("measures and sorts by distance", () => {
    expect(distanceKm(SF, { lat: 37.78, lng: -122.42 })).toBeCloseTo(1.11, 1);
    const rows = [{ id: "far", lat: 38, lng: -122 }, { id: "near", lat: 37.771, lng: -122.42 }];
    expect(byDistance(rows, SF).map((r) => r.id)).toEqual(["near", "far"]);
  });
});

describe("mergeInput", () => {
  it("keeps stored cuisine, tags and Google id when the refresh has none", async () => {
    const db = await freshDb();
    const stored = await addPlace(db, { googlePlaceId: "g1", tags: { openingHours: "24/7", attributes: ["cafe"] } });
    const merged = mergeInput(stored, placeInput({ cuisine: [], tags: { attributes: ["restaurant"] } }));
    expect(merged.cuisine).toEqual(["chinese", "noodles"]);
    expect(merged.googlePlaceId).toBe("g1");
    expect(merged.tags).toEqual({ openingHours: "24/7", attributes: ["cafe", "restaurant"] });
    expect(mergeInput(null, placeInput())).toEqual(placeInput());
  });
});

describe("searchStored", () => {
  it("returns fetched places first, then stored matches, without duplicates", async () => {
    const db = await freshDb();
    await addPlace(db, { sourceId: "node/old", name: "Mian Noodle" });
    const rows = await searchStored(db, "mian", SF, async () => [placeInput({ sourceId: "node/1" }), placeInput({ sourceId: "node/old", name: "Mian Noodle" })], 5);
    expect(rows.map((r) => r.sourceId)).toEqual(["node/1", "node/old"]);
  });

  it("falls back to stored places when the fetch fails, and throws when there are none", async () => {
    const db = await freshDb();
    const fail = async () => {
      throw new PlacesError("down", 503);
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(searchStored(db, "mian", null, fail, 1)).rejects.toMatchObject({ status: 503 });
    await addPlace(db);
    expect((await searchStored(db, "mian", null, fail, 1)).map((r) => r.name)).toEqual(["Mian"]);
  });
});

describe("nearbyStored", () => {
  it("merges fetched and stored places inside the radius, nearest first", async () => {
    const db = await freshDb();
    await addPlace(db, { sourceId: "node/stored", lat: 37.775, lng: -122.42 });
    await addPlace(db, { sourceId: "node/far", lat: 37.9, lng: -122.42 });
    const rows = await nearbyStored(db, SF, 2, async () => [placeInput({ sourceId: "node/new", lat: 37.7701, lng: -122.42 })], 5);
    expect(rows.map((r) => r.sourceId)).toEqual(["node/new", "node/stored"]);
  });

  it("keeps the details a later search would lose", async () => {
    const db = await freshDb();
    await saveFetched(db, [placeInput({ tags: { openingHours: "Mo-Su 10:00-22:00" } })], 1);
    const [again] = await saveFetched(db, [placeInput({ cuisine: [], tags: { attributes: ["restaurant"] } })], 2);
    expect(again.tags.openingHours).toBe("Mo-Su 10:00-22:00");
    expect(again.cuisine).toEqual(["chinese", "noodles"]);
  });
});

describe("liveDetails", () => {
  const details = { rating: 4.5, ratingCount: 10, priceLevel: 2, phone: null, website: null, mapsUrl: null, openNow: true, hours: [], summary: null };

  it("matches a Google id once, stores only the id, and returns live details", async () => {
    const db = await freshDb();
    const place = await addPlace(db);
    const google = { locate: vi.fn(async () => ({ placeId: "gid", location: { lat: 37.7701, lng: -122.42 } })), details: vi.fn(async () => details) } as unknown as GoogleClient;
    expect(await liveDetails(db, place, google, 2)).toEqual(details);
    expect((await getPlace(db, place.id))?.googlePlaceId).toBe("gid");
    expect(google.details).toHaveBeenCalledWith("gid");
  });

  it("ignores a Google match too far away", async () => {
    const db = await freshDb();
    const place = await addPlace(db);
    const google = { locate: async () => ({ placeId: "gid", location: { lat: 38, lng: -122.42 } }), details: vi.fn() } as unknown as GoogleClient;
    expect(await liveDetails(db, place, google, 2)).toBeNull();
    expect((await getPlace(db, place.id))?.googlePlaceId).toBeNull();
  });
});

describe("liveRatings", () => {
  const base = { priceLevel: null, phone: null, website: null, mapsUrl: null, openNow: null, hours: [], summary: null };

  it("returns ratings by place id, never stores them, and skips failures, misses and slow calls", async () => {
    const db = await freshDb();
    const rated = await addPlace(db, { sourceId: "node/1", googlePlaceId: "g1" });
    const unrated = await addPlace(db, { sourceId: "node/2", googlePlaceId: "g2" });
    const failing = await addPlace(db, { sourceId: "node/3", googlePlaceId: "g3" });
    const slow = await addPlace(db, { sourceId: "node/4", googlePlaceId: "g4" });
    const google = {
      locate: vi.fn(),
      details: vi.fn(async (id: string) => {
        if (id === "g3") throw new Error("down");
        if (id === "g4") await new Promise((r) => setTimeout(r, 200));
        return { ...base, rating: id === "g2" ? null : 4.6, ratingCount: id === "g2" ? null : 812 };
      }),
    } as unknown as GoogleClient;
    const ratings = await liveRatings(db, [rated, unrated, failing, slow], google, 2, 50);
    expect([...ratings]).toEqual([[rated.id, { rating: 4.6, count: 812 }]]);
    expect((await getPlace(db, rated.id))?.tags).not.toHaveProperty("rating");
  });
});
