import { describe, expect, it } from "vitest";
import { VisitInputSchema, VisitPatchSchema } from "./types";

const base = { placeId: "00000000-0000-4000-8000-000000000001", visitedOn: "2026-11-11", reaction: "loved", occasion: "casual" };

describe("VisitInputSchema", () => {
  it("defaults rating to null and dated to true for older clients", () => {
    expect(VisitInputSchema.parse(base)).toMatchObject({ rating: null, dated: true, dishes: [], note: null });
  });

  it("accepts a rating inside the reaction's band and rejects one outside", () => {
    expect(VisitInputSchema.parse({ ...base, rating: 8 }).rating).toBe(8);
    expect(VisitInputSchema.safeParse({ ...base, reaction: "fine", rating: 8 }).success).toBe(false);
    expect(VisitInputSchema.safeParse({ ...base, reaction: "disliked", rating: 4 }).success).toBe(true);
    expect(VisitInputSchema.safeParse({ ...base, reaction: "disliked", rating: 5 }).success).toBe(false);
    expect(VisitInputSchema.safeParse({ ...base, rating: 11 }).success).toBe(false);
    expect(VisitInputSchema.safeParse({ ...base, rating: 8.5 }).success).toBe(false);
  });
});

describe("VisitPatchSchema", () => {
  it("fills in nothing that wasn't sent", () => {
    expect(VisitPatchSchema.parse({ rating: 9 })).toEqual({ rating: 9 });
    expect(VisitPatchSchema.parse({})).toEqual({});
  });
});
