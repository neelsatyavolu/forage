import { describe, expect, it } from "vitest";
import type { Place, Visit } from "@/lib/types";
import { beenPins, beenRows, filterOccasion, occasionCounts, placeLine } from "./been";

const place = (id: string, name: string, extra: Partial<Place> = {}): Place => ({
  id, name, source: "osm", sourceId: id, googlePlaceId: null, lat: 1, lng: 2, address: null, city: "Oakland", country: null, cuisine: [], priceLevel: null, tags: {}, updatedAt: 0, ...extra,
});
const visit = (placeId: string, occasion: Visit["occasion"], visitedOn: string, reaction: Visit["reaction"] = "loved"): Visit => ({
  id: `${placeId}-${visitedOn}`, userId: "u", placeId, occasion, visitedOn, reaction, dishes: [], note: null, createdAt: 0,
});
const score = (placeId: string, occasion: Visit["occasion"], s: number) => ({ userId: "u", placeId, occasion, score: s, updatedAt: 0 });

describe("beenRows", () => {
  const data = {
    places: [place("a", "Alpha"), place("b", "Bravo")],
    // Newest first, as the API sends them.
    visits: [visit("a", "casual", "2026-11-09", "fine"), visit("b", "casual", "2026-11-01"), visit("a", "casual", "2026-10-01", "disliked"), visit("a", "special", "2026-09-01")],
    scores: [score("a", "casual", 6.2), score("b", "casual", 8.9), score("a", "special", 8.5)],
  };

  it("makes one row per place and occasion, best score first, from the latest visit", () => {
    const rows = beenRows(data);
    expect(rows.map((r) => [r.place.name, r.occasion, r.score])).toEqual([["Bravo", "casual", 8.9], ["Alpha", "special", 8.5], ["Alpha", "casual", 6.2]]);
    expect(rows[2]).toMatchObject({ reaction: "fine", lastVisited: "2026-11-09", visits: 2 });
  });

  it("filters and counts by occasion", () => {
    const rows = beenRows(data);
    expect(filterOccasion(rows, "special").map((r) => r.place.name)).toEqual(["Alpha"]);
    expect(filterOccasion(rows, "all")).toHaveLength(3);
    expect(occasionCounts(rows)).toEqual({ all: 3, quick: 0, casual: 2, night_out: 0, special: 1 });
  });

  it("pins each place once with its best score", () => {
    const pins = beenPins(beenRows(data));
    expect(pins.find((p) => p.id === "a")?.score).toBe(8.5);
    expect(pins).toHaveLength(2);
  });

  it("puts unscored rows last", () => {
    const rows = beenRows({ ...data, scores: [] });
    expect(rows.every((r) => r.score === null)).toBe(true);
  });
});

describe("placeLine", () => {
  it("shows cuisine and where", () => {
    expect(placeLine(place("x", "X", { cuisine: ["ramen", "japanese"], address: "1 Main St" }))).toBe("Ramen, japanese · 1 Main St");
    expect(placeLine(place("x", "X", { tags: { attributes: ["cafe"] } }))).toBe("Cafe · Oakland");
  });
});
