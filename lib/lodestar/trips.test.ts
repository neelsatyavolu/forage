import { describe, expect, it } from "vitest";
import type { Place } from "../types";
import { AddToTripSchema, diningByDay, diningItem, tripDays, type TripDetail } from "./trips";

const place: Place = {
  id: "22222222-2222-4222-8222-222222222222",
  source: "osm",
  sourceId: "node/1",
  googlePlaceId: "ChIJabc",
  name: "Mian",
  lat: 37.77,
  lng: -122.42,
  address: "1 Main St",
  city: "San Francisco",
  country: "US",
  cuisine: ["chinese", "noodles"],
  priceLevel: 2,
  tags: { website: "https://mian.example/", phone: "+1 415 555 0100" },
  updatedAt: 1,
};

describe("tripDays", () => {
  it("lists each day inclusive, across a month end", () => {
    expect(tripDays("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("handles one date, no dates, and end before start", () => {
    expect(tripDays("2026-12-01", null)).toEqual(["2026-12-01"]);
    expect(tripDays(null, "2026-12-01")).toEqual(["2026-12-01"]);
    expect(tripDays(null, null)).toEqual([]);
    expect(tripDays("2026-12-05", "2026-12-01")).toEqual(["2026-12-05"]);
  });
  it("caps very long trips", () => {
    expect(tripDays("2026-01-01", "2026-12-31")).toHaveLength(60);
  });
});

describe("diningByDay", () => {
  it("groups planned and booked meals by day, skipping ideas and cancellations", () => {
    const trip: TripDetail = {
      id: "t", title: "T", destination: null, startDate: null, endDate: null,
      items: [
        { id: "1", kind: "dining", status: "planned", title: "A", startDate: "2026-12-01" },
        { id: "2", kind: "dining", status: "booked", title: "B", startDate: "2026-12-01" },
        { id: "3", kind: "dining", status: "suggested", title: "C", startDate: "2026-12-01" },
        { id: "4", kind: "stay", status: "booked", title: "Hotel", startDate: "2026-12-01" },
        { id: "5", kind: "dining", status: "cancelled", title: "D", startDate: "2026-12-02" },
      ],
    };
    expect(Object.fromEntries(Object.entries(diningByDay(trip)).map(([d, l]) => [d, l.map((i) => i.title)]))).toEqual({ "2026-12-01": ["A", "B"] });
  });
});

describe("diningItem", () => {
  it("builds a planned dining item with the place's facts", () => {
    expect(diningItem(place, { day: "2026-12-01", time: "19:30", note: "Ask for the counter" }, 5)).toEqual({
      kind: "dining",
      status: "planned",
      title: "Mian",
      startDate: "2026-12-01",
      startTime: "19:30",
      place: "San Francisco",
      details: {
        address: "1 Main St", lat: 37.77, lng: -122.42, locatedAt: 5, cuisine: "chinese", priceLevel: "$$", phone: "+1 415 555 0100",
        url: "https://mian.example/", placeId: "g:ChIJabc", note: "Ask for the counter", provider: "Forage",
      },
    });
  });

  it("leaves out what the place doesn't have, and bad websites", () => {
    const bare = { ...place, googlePlaceId: null, address: null, city: null, cuisine: [], priceLevel: null, tags: { website: "javascript:alert(1)" } };
    const item = diningItem(bare, { day: "2026-12-01", time: null, note: null }, 5);
    expect(item.place).toBeNull();
    expect(item.details).toEqual({ lat: 37.77, lng: -122.42, locatedAt: 5, provider: "Forage" });
  });
});

describe("AddToTripSchema", () => {
  const base = { tripId: "11111111-1111-4111-8111-111111111111", placeId: place.id, day: "2026-12-01" };
  it("defaults time and note", () => {
    expect(AddToTripSchema.parse(base)).toEqual({ ...base, time: null, note: null });
  });
  it("rejects bad days, times and ids", () => {
    expect(AddToTripSchema.safeParse({ ...base, day: "2026-13-01" }).success).toBe(false);
    expect(AddToTripSchema.safeParse({ ...base, time: "7pm" }).success).toBe(false);
    expect(AddToTripSchema.safeParse({ ...base, tripId: "x" }).success).toBe(false);
  });
});
