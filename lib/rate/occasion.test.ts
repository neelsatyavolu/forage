import { describe, expect, it } from "vitest";
import type { PlaceTags } from "../types";
import { guessOccasion, placeKind } from "./occasion";

const p = (tags: PlaceTags, priceLevel: number | null = null, cuisine: string[] = []) => ({ tags, priceLevel, cuisine });

describe("guessOccasion", () => {
  it("uses the place's one occasion first", () => {
    expect(guessOccasion(p({ occasions: ["night_out"], attributes: ["cafe"] }, 4))).toBe("night_out");
  });

  it("ignores several occasions, then treats $$$$ as special", () => {
    expect(guessOccasion(p({ occasions: ["quick", "casual"], attributes: ["cafe"] }, 4))).toBe("special");
  });

  it("maps the amenity", () => {
    expect(guessOccasion(p({ attributes: ["fast food"] }))).toBe("quick");
    expect(guessOccasion(p({ attributes: ["bakery", "takeaway"] }))).toBe("quick");
    expect(guessOccasion(p({ attributes: ["pub"] }))).toBe("night_out");
    expect(guessOccasion(p({ attributes: ["biergarten"] }))).toBe("night_out");
    expect(guessOccasion(p({ attributes: ["restaurant"] }))).toBe("casual");
  });

  it("falls back to casual", () => {
    expect(guessOccasion(p({}))).toBe("casual");
    expect(guessOccasion(p({ attributes: ["outdoor seating"] }))).toBe("casual");
  });
});

describe("placeKind", () => {
  it("prefers the first cuisine, then the amenity, in title case", () => {
    expect(placeKind(p({ attributes: ["restaurant"] }, null, ["coffee shop", "sushi"]))).toBe("Coffee Shop");
    expect(placeKind(p({ attributes: ["fast food"] }))).toBe("Fast Food");
    expect(placeKind(p({}))).toBe("Place");
  });
});
