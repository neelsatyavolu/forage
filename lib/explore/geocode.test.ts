import { describe, expect, it } from "vitest";
import { fakeFetch, json } from "../lodestar/fake";
import { geocodeArea, parseAreas, radiusFor } from "./geocode";

const feature = (name: string, type: string, extra: Record<string, string> = {}, coords: [number, number] = [-122.42, 37.76]) => ({ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: { name, type, ...extra } });

describe("parseAreas", () => {
  it("labels areas and sizes the radius by kind", () => {
    const areas = parseAreas({
      features: [feature("Mission District", "district", { city: "San Francisco", state: "California", country: "United States" }), feature("San Francisco", "city", { state: "California", country: "United States" }, [-122.44, 37.77])],
    });
    expect(areas).toEqual([
      { label: "Mission District, San Francisco, California, United States", name: "Mission District", lat: 37.76, lng: -122.42, radiusKm: 2 },
      { label: "San Francisco, California, United States", name: "San Francisco", lat: 37.77, lng: -122.44, radiusKm: 5 },
    ]);
  });

  it("drops duplicates, nameless and malformed features", () => {
    const areas = parseAreas({ features: [feature("Paris", "city", { country: "France" }), feature("Paris", "city", { country: "France" }), { properties: {} }, feature("", "city"), "junk"] });
    expect(areas.map((a) => a.label)).toEqual(["Paris, France"]);
    expect(parseAreas(null)).toEqual([]);
  });

  it("radiusFor", () => {
    expect([radiusFor("county"), radiusFor("city"), radiusFor("locality"), radiusFor(undefined)]).toEqual([15, 5, 2, 2]);
  });
});

describe("geocodeArea", () => {
  it("asks Photon for areas only", async () => {
    const f = fakeFetch(() => json({ features: [feature("Lisbon", "city", { country: "Portugal" })] }));
    expect((await geocodeArea(f.fetch, "lisbon")).map((a) => a.name)).toEqual(["Lisbon"]);
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.get("q")).toBe("lisbon");
    expect(url.searchParams.getAll("layer")).toEqual(["city", "district", "locality", "county"]);
  });

  it("throws when Photon fails", async () => {
    await expect(geocodeArea(fakeFetch(() => json({}, 500)).fetch, "x")).rejects.toThrow();
  });
});
