import { describe, expect, it } from "vitest";
import { TILE_DEG, tilesAround, tilesBox } from "./tiles";

describe("tiles", () => {
  it("snaps nearby points to the same tiles", () => {
    expect(tilesAround({ lat: 37.4443, lng: -122.1598 }, 1)).toEqual(tilesAround({ lat: 37.4447, lng: -122.1601 }, 1));
  });

  it("covers the whole circle", () => {
    const at = { lat: 37.4443, lng: -122.1598 };
    const box = tilesBox(tilesAround(at, 2));
    expect(box.minLat).toBeLessThanOrEqual(at.lat - 2 / 111.32);
    expect(box.maxLat).toBeGreaterThanOrEqual(at.lat + 2 / 111.32);
    expect(box.minLng).toBeLessThan(at.lng - 0.02);
    expect(box.maxLng).toBeGreaterThan(at.lng + 0.02);
    expect((box.maxLat - box.minLat) / TILE_DEG).toBeCloseTo(Math.round((box.maxLat - box.minLat) / TILE_DEG));
  });

  it("gives one tile's own edges", () => {
    expect(tilesBox(["1872:-6108"])).toEqual({ minLat: 37.44, maxLat: 37.46, minLng: -122.16, maxLng: -122.14 });
  });
});
