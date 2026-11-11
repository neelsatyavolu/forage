import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOsmCache, overpassNearby, photonSearch } from "./osm";
import { fromOverpass, fromPhoton, overpassQuery } from "./osm-parse";

const photonFeature = (props: Record<string, unknown>, coords: [number, number] = [-122.42, 37.77]) => ({
  geometry: { coordinates: coords },
  properties: { osm_type: "N", osm_id: 42, osm_key: "amenity", osm_value: "restaurant", name: "Mian", street: "Main St", housenumber: "1", city: "San Francisco", country: "United States", ...props },
});

describe("fromPhoton", () => {
  it("maps a restaurant to a place input", () => {
    expect(fromPhoton(photonFeature({}))).toMatchObject({
      source: "osm",
      sourceId: "node/42",
      name: "Mian",
      lat: 37.77,
      lng: -122.42,
      address: "1 Main St, San Francisco, United States",
      city: "San Francisco",
      tags: { attributes: ["restaurant"] },
    });
  });

  it("drops things that aren't food, or lack a name or location", () => {
    expect(fromPhoton(photonFeature({ osm_value: "parking" }))).toBeNull();
    expect(fromPhoton(photonFeature({ name: undefined }))).toBeNull();
    expect(fromPhoton({ properties: photonFeature({}).properties })).toBeNull();
    expect(fromPhoton(null)).toBeNull();
  });
});

describe("fromOverpass", () => {
  const way = {
    type: "way",
    id: 7,
    center: { lat: 40.7, lon: -74 },
    tags: { amenity: "cafe", name: "Bean", cuisine: "coffee_shop;breakfast", "addr:street": "Elm St", "addr:housenumber": "5", "addr:city": "NYC", outdoor_seating: "yes", "diet:vegan": "only", opening_hours: "Mo-Fr 07:00-15:00", website: "https://bean.example" },
  };

  it("reads cuisine, address, attributes and hours", () => {
    expect(fromOverpass(way)).toEqual({
      source: "osm",
      sourceId: "way/7",
      googlePlaceId: null,
      name: "Bean",
      lat: 40.7,
      lng: -74,
      address: "5 Elm St, NYC",
      city: "NYC",
      country: null,
      cuisine: ["coffee shop", "breakfast"],
      priceLevel: null,
      tags: { attributes: ["cafe", "outdoor seating", "vegan options"], openingHours: "Mo-Fr 07:00-15:00", website: "https://bean.example" },
    });
  });

  it("drops unnamed or non-food elements", () => {
    expect(fromOverpass({ ...way, tags: { amenity: "cafe" } })).toBeNull();
    expect(fromOverpass({ ...way, tags: { amenity: "bank", name: "Bank" } })).toBeNull();
  });
});

describe("overpassQuery", () => {
  it("asks for named food places around the point", () => {
    const q = overpassQuery(37.7712345, -122.4, 1500, 100);
    expect(q).toContain("(around:1500,37.77123,-122.40000)");
    expect(q).toContain("restaurant|cafe|bar");
    expect(q).toContain("out center tags 100");
  });
});

describe("network calls", () => {
  afterEach(() => clearOsmCache());
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("searches Photon with food filters and caches the answer", async () => {
    const fetcher = vi.fn(async () => json({ features: [photonFeature({}), photonFeature({ osm_value: "parking", osm_id: 9 })] }));
    const rows = await photonSearch("mian", { lat: 37.77, lng: -122.42 }, fetcher as unknown as typeof fetch);
    expect(rows.map((r) => r.sourceId)).toEqual(["node/42"]);
    const url = String((fetcher.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("osm_tag=amenity%3Arestaurant");
    expect(url).toContain("lat=37.770");
    await photonSearch("mian", { lat: 37.77, lng: -122.42 }, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a busy Overpass once, then throws a 503", async () => {
    const fetcher = vi.fn(async () => json({}, 429));
    await expect(overpassNearby(1, 2, 1, fetcher as unknown as typeof fetch)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("moves on to the second Overpass server when the first is busy", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("overpass-api.de") ? json({}, 504) : json({ elements: [] })));
    expect(await overpassNearby(3, 4, 1, fetcher as unknown as typeof fetch)).toEqual([]);
    expect(fetcher.mock.calls.map((c) => new URL(String(c[0])).host)).toEqual(["overpass-api.de", "overpass.private.coffee"]);
  });

  it("parses Overpass elements", async () => {
    const fetcher = vi.fn(async () => json({ elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: { amenity: "bar", name: "Tap" } }] }));
    const rows = await overpassNearby(1, 2, 20, fetcher as unknown as typeof fetch);
    expect(rows.map((r) => r.name)).toEqual(["Tap"]);
    const body = String(((fetcher.mock.calls[0] as unknown[])[1] as RequestInit).body);
    expect(decodeURIComponent(body)).toContain("around:5000,");
  });
});
