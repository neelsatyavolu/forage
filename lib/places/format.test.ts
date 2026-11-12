import { describe, expect, it } from "vitest";
import { distanceLabel, placeKind, priceLabel, shortAddress } from "./format";

describe("shortAddress", () => {
  it("keeps the street and drops the city, state and country", () => {
    expect(shortAddress({ address: "300 Grove St, San Francisco, California, United States", city: "San Francisco" })).toBe("300 Grove St");
  });
  it("falls back to the city, then nothing", () => {
    expect(shortAddress({ address: null, city: "Oakland" })).toBe("Oakland");
    expect(shortAddress({ address: " , x", city: null })).toBeNull();
    expect(shortAddress({ address: null, city: null })).toBeNull();
  });
});

describe("distanceLabel", () => {
  it("uses metres under 1 km", () => {
    expect(distanceLabel(0.29)).toBe("290 m");
    expect(distanceLabel(1.44)).toBe("1.4 km");
  });
});

describe("priceLabel and placeKind", () => {
  it("formats price and kind", () => {
    expect(priceLabel(2)).toBe("$$");
    expect(priceLabel(null)).toBeNull();
    expect(placeKind({ cuisine: [], tags: { attributes: ["fast food"] } })).toBe("Fast Food");
  });
});
