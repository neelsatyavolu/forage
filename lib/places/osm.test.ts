import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOsmCache, photonNearby, photonSearch, USER_AGENT } from "./osm";
import { fromOverpass, fromPhoton, overpassBoxQuery } from "./osm-parse";

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

  it("records diets a place marks as not served", () => {
    const tags = { ...way.tags, "diet:vegetarian": "no", "diet:vegan": "no", "diet:halal": "yes" };
    expect(fromOverpass({ ...way, tags })?.tags.dietNo).toEqual(["vegetarian", "vegan"]);
    expect(fromOverpass(way)?.tags).not.toHaveProperty("dietNo");
  });

  it("drops unnamed or non-food elements", () => {
    expect(fromOverpass({ ...way, tags: { amenity: "cafe" } })).toBeNull();
    expect(fromOverpass({ ...way, tags: { amenity: "bank", name: "Bank" } })).toBeNull();
  });
});

describe("overpassBoxQuery", () => {
  it("asks for named food places inside the box, south-west-north-east", () => {
    const q = overpassBoxQuery({ minLat: 37.44, minLng: -122.18, maxLat: 37.46, maxLng: -122.14 }, 100, 8);
    expect(q).toContain("(37.44000,-122.18000,37.46000,-122.14000)");
    expect(q).toContain("[timeout:8]");
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

  it("asks Photon for food places around a point, with a named User-Agent", async () => {
    const fetcher = vi.fn(async () => json({ features: [photonFeature({}), photonFeature({ osm_value: "parking", osm_id: 9 })] }));
    const rows = await photonNearby({ lat: 37.4443, lng: -122.1598 }, 2, fetcher as unknown as typeof fetch);
    expect(rows.map((r) => r.sourceId)).toEqual(["node/42"]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(new URL(url).pathname).toBe("/reverse");
    expect([params.get("lat"), params.get("lon"), params.get("radius")]).toEqual(["37.44430", "-122.15980", "2"]);
    expect(params.getAll("osm_tag")).toEqual(["amenity:restaurant", "amenity:cafe", "amenity:bar", "amenity:fast_food", "amenity:pub"]);
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("Forage/1.0 (+https://forage.xanom.co)");
  });

  it("throws when Photon's nearby answer is unreadable or it stays busy", async () => {
    await expect(photonNearby({ lat: 1, lng: 2 }, 1, (async () => json({ nope: 1 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 502 });
    const busy = vi.fn(async () => json({}, 503));
    await expect(photonNearby({ lat: 1, lng: 2 }, 1, busy as unknown as typeof fetch)).rejects.toMatchObject({ status: 503 });
    expect(busy).toHaveBeenCalledTimes(2);
  });
});
