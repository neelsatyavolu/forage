import { afterEach, describe, expect, it, vi } from "vitest";
import { addPlace, freshDb, placeInput } from "@/test/db";
import { markTiles, tileTimes } from "../db/osm-tiles";
import { QUICK_OVERPASS_MS, TILE_TTL_MS, nearbyWith, type NearbyDeps } from "./nearby";
import { photonNearby } from "./osm";
import { overpassBox, resetOverpassBreaker, type OverpassResult } from "./overpass";
import { tilesAround, tilesBox } from "./tiles";

const PA = { lat: 37.4443, lng: -122.1598 };
const DAY = 24 * 60 * 60_000;
const NOW = 100 * DAY;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const node = (id: number, name: string, lat = PA.lat + 0.001 * id, lon = PA.lng) => ({ type: "node", id, lat, lon, tags: { amenity: "restaurant", name } });
const photonFeature = (id: number, name: string) => ({
  geometry: { coordinates: [PA.lng, PA.lat + 0.001 * id] },
  properties: { osm_type: "N", osm_id: id, osm_key: "amenity", osm_value: "cafe", name },
});

const down = async (): Promise<never> => {
  throw new Error("down");
};

afterEach(() => resetOverpassBreaker());

async function setup(overrides: Partial<NearbyDeps> = {}) {
  const db = await freshDb();
  const deferred: Promise<unknown>[] = [];
  const deps: NearbyDeps = {
    db,
    overpass: vi.fn<NearbyDeps["overpass"]>(down),
    photon: vi.fn<NearbyDeps["photon"]>(down),
    refill: vi.fn<NearbyDeps["refill"]>(async () => undefined),
    defer: (work) => deferred.push(work),
    now: NOW,
    ...overrides,
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  return { db, deps, deferred };
}

describe("nearbyWith", () => {
  it("gives Overpass one quick try on the first mirror, stores the places and records the tiles", async () => {
    const fetcher = vi.fn(async () => json({ elements: [node(2, "Two"), node(1, "One")] }));
    const quick = (box: Parameters<NearbyDeps["overpass"]>[0]) =>
      overpassBox(box, { budgetMs: QUICK_OVERPASS_MS, perMirrorMs: QUICK_OVERPASS_MS, maxMirrors: 1, fetcher: fetcher as unknown as typeof fetch });
    const { db, deps, deferred } = await setup({ overpass: quick });
    const result = await nearbyWith(deps, PA, 2);
    expect(result).toMatchObject({ source: "overpass", mirror: "overpass-api.de", refilling: false });
    expect(result.places.map((p) => p.name)).toEqual(["One", "Two"]);
    const tiles = tilesAround(PA, 2);
    expect([...(await tileTimes(db, tiles)).values()]).toEqual(tiles.map(() => NOW));
    expect(deferred).toHaveLength(0);
  });

  it("serves fresh tiles from the database without any network call", async () => {
    const { db, deps } = await setup();
    await addPlace(db, { sourceId: "node/9", name: "Cached", lat: PA.lat, lng: PA.lng });
    await markTiles(db, tilesAround(PA, 2), NOW - 13 * DAY);
    const result = await nearbyWith(deps, PA, 2);
    expect(result).toMatchObject({ source: "cache", refilling: false, places: [{ name: "Cached" }] });
    expect(deps.overpass).not.toHaveBeenCalled();
    expect(deps.photon).not.toHaveBeenCalled();
    expect(deps.refill).not.toHaveBeenCalled();
  });

  it("fetches only the box of missing or stale tiles", async () => {
    const { db, deps } = await setup({ overpass: vi.fn(async () => ({ rows: [], mirror: "m", truncated: false })) });
    const tiles = tilesAround(PA, 2);
    await markTiles(db, tiles, NOW);
    const [stale] = tiles;
    await markTiles(db, [stale], NOW - TILE_TTL_MS);
    expect((await nearbyWith(deps, PA, 2)).source).toBe("overpass");
    expect(deps.overpass).toHaveBeenCalledWith(tilesBox([stale]));
  });

  it("serves stale tiles when Overpass misses, and refills them in the background", async () => {
    const { db, deps, deferred } = await setup();
    await addPlace(db, { sourceId: "node/9", name: "Old", lat: PA.lat, lng: PA.lng });
    const tiles = tilesAround(PA, 2);
    await markTiles(db, tiles, NOW - 30 * DAY);
    const result = await nearbyWith(deps, PA, 2);
    expect(result).toMatchObject({ source: "stale", refilling: true, places: [{ name: "Old" }] });
    expect(deps.photon).not.toHaveBeenCalled();
    expect(deps.refill).toHaveBeenCalledWith(tiles, { perTile: false });
    expect(deferred).toHaveLength(1);
  });

  it("asks Photon when Overpass misses and the area was never fetched, and refills in the background", async () => {
    const fetcher = vi.fn(async () => json({ features: [photonFeature(1, "Bean")] }));
    const { db, deps, deferred } = await setup({ photon: (at, km) => photonNearby(at, km, fetcher as unknown as typeof fetch) });
    const result = await nearbyWith(deps, PA, 2);
    expect(result).toMatchObject({ source: "photon", refilling: true, places: [{ name: "Bean" }] });
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("photon.komoot.io/reverse");
    expect((await tileTimes(db, tilesAround(PA, 2))).size).toBe(0);
    expect(deferred).toHaveLength(1);
  });

  it("returns stored places when Overpass and Photon both fail", async () => {
    const { db, deps } = await setup();
    await addPlace(db, { sourceId: "node/9", name: "Logged", lat: PA.lat, lng: PA.lng });
    expect(await nearbyWith(deps, PA, 2)).toMatchObject({ source: "stored", places: [{ name: "Logged" }] });
    const empty = await setup();
    expect(await nearbyWith(empty.deps, PA, 2)).toEqual({ source: "stored", refilling: true, places: [] });
  });

  it("keeps a cut-short answer's places but refills its tiles one by one", async () => {
    const rows = [placeInput({ sourceId: "node/far", name: "Far", lat: PA.lat + 0.03, lng: PA.lng }), placeInput({ sourceId: "node/near", name: "Near", lat: PA.lat, lng: PA.lng })];
    const { db, deps } = await setup({ overpass: vi.fn(async (): Promise<OverpassResult> => ({ rows, mirror: "m", truncated: true })) });
    const result = await nearbyWith(deps, PA, 2);
    expect(result).toMatchObject({ source: "overpass", refilling: true });
    expect(result.places.map((p) => p.name)).toEqual(["Near"]);
    expect((await tileTimes(db, tilesAround(PA, 2))).size).toBe(0);
    expect(deps.refill).toHaveBeenCalledWith(tilesAround(PA, 2), { perTile: true });
  });

  it("caps the tiles fetched at 5 km for wider searches", async () => {
    const { deps } = await setup();
    await nearbyWith(deps, PA, 10);
    const box = vi.mocked(deps.overpass).mock.calls[0][0];
    expect(box.maxLat - box.minLat).toBeLessThan(0.14);
  });
});
