import { describe, expect, it } from "vitest";
import { fromOverpass } from "../../lib/places/osm-parse";
import { bboxCenter, placeFromLine, toElement } from "./feature";
import { parseStates, US_STATES } from "./states";

// The import must store exactly what an Overpass refill stores for the same
// OSM object: same source id, point, address, cuisine and lean tags.

const tags = {
  amenity: "restaurant",
  name: "Mian",
  cuisine: "chinese;noodle_bar",
  "addr:housenumber": "1",
  "addr:street": "Main St",
  "addr:city": "Providence",
  outdoor_seating: "yes",
  "diet:vegan": "no",
  opening_hours: "Mo-Su 11:00-22:00",
  website: "https://example.com",
  brand: "Mian",
  "brand:wikidata": "Q1",
  // Not read by the app, so not stored.
  "survey:date": "2024-01-01",
  "payment:cash": "yes",
};

const line = (feature: object, rs = false) => `${rs ? "\x1e" : ""}${JSON.stringify(feature)}`;

describe("placeFromLine parity with fromOverpass", () => {
  it("maps a node exactly like the Overpass element", () => {
    const geo = { type: "Feature", geometry: { type: "Point", coordinates: [-71.4128343, 41.8239891] }, properties: { "@type": "node", "@id": 42, ...tags } };
    const overpass = { type: "node", id: 42, lat: 41.8239891, lon: -71.4128343, tags };
    const place = placeFromLine(line(geo));
    expect(place).toEqual(fromOverpass(overpass));
    expect(place?.sourceId).toBe("node/42");
    expect(Object.keys(place!.tags).sort()).toEqual(["attributes", "brand", "dietNo", "openingHours", "website", "wikidata"]);
  });

  it("maps a way polygon to its bounding-box centre, as Overpass `out center` does", () => {
    const ring = [[-71.40, 41.80], [-71.39, 41.80], [-71.39, 41.82], [-71.40, 41.82], [-71.40, 41.80]];
    const geo = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[ring]] }, properties: { "@type": "way", "@id": 7, ...tags } };
    const overpass = { type: "way", id: 7, center: { lat: 41.81, lon: -71.395 }, tags };
    expect(placeFromLine(line(geo, true))).toEqual(fromOverpass(overpass));
  });

  it("gives the same place for a way exported as a line and as an area", () => {
    const ring = [[-71.40, 41.80], [-71.39, 41.80], [-71.39, 41.82], [-71.40, 41.80]];
    const props = { "@type": "way", "@id": 8, ...tags };
    const asLine = placeFromLine(line({ type: "Feature", geometry: { type: "LineString", coordinates: ring }, properties: props }));
    const asArea = placeFromLine(line({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[ring]] }, properties: props }));
    expect(asLine).toEqual(asArea);
  });

  it("skips unnamed places, other amenities, bad lines and missing ids", () => {
    const point = { type: "Point", coordinates: [-71.4, 41.8] };
    expect(placeFromLine(line({ type: "Feature", geometry: point, properties: { "@type": "node", "@id": 1, amenity: "cafe" } }))).toBeNull();
    expect(placeFromLine(line({ type: "Feature", geometry: point, properties: { "@type": "node", "@id": 1, amenity: "bank", name: "B" } }))).toBeNull();
    expect(placeFromLine(line({ type: "Feature", geometry: point, properties: { amenity: "cafe", name: "C" } }))).toBeNull();
    expect(placeFromLine("{not json")).toBeNull();
    expect(placeFromLine("   ")).toBeNull();
  });

  it("keeps shop=bakery, like the Overpass query", () => {
    const geo = { type: "Feature", geometry: { type: "Point", coordinates: [-71.4, 41.8] }, properties: { "@type": "node", "@id": 3, shop: "bakery", name: "Crumb" } };
    expect(placeFromLine(line(geo))?.tags.attributes).toEqual(["bakery"]);
  });
});

describe("toElement and bboxCenter", () => {
  it("returns null without coordinates", () => {
    expect(bboxCenter({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(toElement({ geometry: { type: "Point" }, properties: { "@type": "node", "@id": 1 } })).toBeNull();
    expect(toElement({ geometry: { type: "Polygon", coordinates: [] }, properties: { "@type": "way", "@id": 1 } })).toBeNull();
  });

  it("drops osmium's @ attributes from the tags", () => {
    const el = toElement({ geometry: { type: "Point", coordinates: [1, 2] }, properties: { "@type": "node", "@id": 5, name: "X" } });
    expect(el).toEqual({ type: "node", id: 5, lat: 2, lon: 1, tags: { name: "X" } });
  });
});

describe("parseStates", () => {
  it("defaults to every state, DC and Puerto Rico", () => {
    expect(parseStates("")).toHaveLength(52);
    expect(parseStates(undefined)).toEqual([...US_STATES]);
  });

  it("parses a list and rejects unknown names", () => {
    expect(parseStates("Rhode-Island, delaware delaware")).toEqual(["rhode-island", "delaware"]);
    expect(() => parseStates("rhode island")).toThrow(/Unknown state/);
  });
});
