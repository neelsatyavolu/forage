import { afterEach, describe, expect, it, vi } from "vitest";
import { freshDb, placeInput } from "@/test/db";
import type { Db } from "../db/client";
import { claimTiles, markTiles, tileTimes } from "../db/osm-tiles";
import type { Box } from "../db/places";
import { overpassBox, resetOverpassBreaker, type OverpassResult } from "./overpass";
import { CLAIM_TTL_MS, REFILL_BUDGET_MS, refillTiles, resetRefills, type RefillDeps } from "./refill";
import { tilesAround, tilesBox } from "./tiles";

const PA = { lat: 37.4443, lng: -122.1598 };
const NOW = 1_000_000_000;
const TILES = tilesAround(PA, 2);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ok = (rows = [placeInput({ sourceId: "node/1", lat: PA.lat, lng: PA.lng })], truncated = false): OverpassResult => ({ rows, mirror: "m", truncated });

afterEach(() => {
  resetRefills();
  resetOverpassBreaker();
  vi.useRealTimers();
});

function deps(db: Db, overpass: RefillDeps["overpass"], clock = () => NOW): RefillDeps {
  vi.spyOn(console, "error").mockImplementation(() => {});
  return { db, overpass, clock, staleBefore: NOW - 1 };
}

describe("refillTiles", () => {
  it("fetches the claimed tiles in one box, stores the places and marks every tile", async () => {
    const db = await freshDb();
    const overpass = vi.fn(async () => ok());
    expect(await refillTiles(deps(db, overpass), TILES)).toEqual({ claimed: TILES, marked: TILES });
    expect(overpass).toHaveBeenCalledWith(tilesBox(TILES), REFILL_BUDGET_MS);
    expect([...(await tileTimes(db, TILES)).values()]).toEqual(TILES.map(() => NOW));
    expect(await db.query("SELECT 1 FROM places")).toHaveLength(1);
  });

  it("splits a cut-short answer into per-tile requests so each tile can be marked", async () => {
    const db = await freshDb();
    // The whole box is cut short; each tile on its own fits.
    const overpass = vi.fn(async () => ok(undefined, overpass.mock.calls.length === 1));
    const result = await refillTiles(deps(db, overpass), TILES);
    expect(overpass).toHaveBeenCalledTimes(1 + TILES.length);
    expect(result.marked).toEqual(TILES);
  });

  it("goes straight to per-tile requests when asked, leaving a still-dense tile unmarked", async () => {
    const db = await freshDb();
    const [dense, ...rest] = TILES;
    const overpass = vi.fn(async (box: Box) => ok(undefined, JSON.stringify(box) === JSON.stringify(tilesBox([dense]))));
    const result = await refillTiles(deps(db, overpass), TILES, { perTile: true });
    expect(overpass).toHaveBeenCalledTimes(TILES.length);
    expect(result.marked).toEqual(rest);
    expect((await tileTimes(db, [dense])).size).toBe(0);
  });

  it("stops per-tile requests when the budget runs out", async () => {
    const db = await freshDb();
    let now = NOW;
    const overpass = vi.fn(async () => {
      now += 10_000;
      return ok();
    });
    const result = await refillTiles(deps(db, overpass, () => now), TILES, { perTile: true });
    // 45 s budget, 10 s per request, at least 1 s left to start one: five requests.
    expect(overpass).toHaveBeenCalledTimes(5);
    expect(result.marked).toHaveLength(5);
  });

  it("drops a refill of tiles already being refilled in this process", async () => {
    const db = await freshDb();
    let release!: () => void;
    const overpass = vi.fn(() => new Promise<OverpassResult>((resolve) => (release = () => resolve(ok()))));
    const first = refillTiles(deps(db, overpass), TILES);
    expect(await refillTiles(deps(db, overpass), TILES)).toEqual({ claimed: [], marked: [] });
    await vi.waitFor(() => expect(overpass).toHaveBeenCalledOnce());
    release();
    expect((await first).marked).toEqual(TILES);
  });

  it("drops tiles another instance claimed within the last minute, and retries after", async () => {
    const db = await freshDb();
    await claimTiles(db, TILES, NOW - 1_000, CLAIM_TTL_MS, NOW);
    const overpass = vi.fn(async () => ok());
    expect(await refillTiles(deps(db, overpass), TILES)).toEqual({ claimed: [], marked: [] });
    expect(overpass).not.toHaveBeenCalled();
    const later = NOW + CLAIM_TTL_MS;
    expect((await refillTiles({ ...deps(db, overpass, () => later), staleBefore: later - 1 }, TILES)).marked).toEqual(TILES);
  });

  it("doesn't claim a tile someone refreshed in the meantime", async () => {
    const db = await freshDb();
    await markTiles(db, [TILES[0]], NOW);
    expect(await claimTiles(db, TILES, NOW, CLAIM_TTL_MS, NOW - 1)).toEqual(TILES.slice(1));
  });

  it("logs and gives up when no mirror answers, leaving the claim to expire", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const db = await freshDb();
    const fetcher = vi.fn(async () => json({}, 504));
    const overpass = (box: Box, budgetMs: number) => overpassBox(box, { budgetMs, perMirrorMs: 15_000, breakOnTimeout: true, fetcher: fetcher as unknown as typeof fetch });
    expect(await refillTiles(deps(db, overpass, Date.now), TILES)).toEqual({ claimed: TILES, marked: [] });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect((await tileTimes(db, TILES)).size).toBe(0);
    expect(await claimTiles(db, TILES, NOW + 1, CLAIM_TTL_MS, NOW)).toEqual([]);
  });
});
