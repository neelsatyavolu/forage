import { describe, expect, it } from "vitest";
import { parseLatLng } from "./use-location";

describe("parseLatLng", () => {
  it("reads a typed coordinate pair", () => {
    expect(parseLatLng(" 37.7749, -122.4194 ")).toEqual({ lat: 37.7749, lng: -122.4194, label: "37.7749, -122.4194" });
  });
  it("refuses text and out-of-range values", () => {
    expect(parseLatLng("Mission District")).toBeNull();
    expect(parseLatLng("95, 10")).toBeNull();
    expect(parseLatLng("10, 190")).toBeNull();
  });
});
