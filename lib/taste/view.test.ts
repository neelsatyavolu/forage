import { describe, expect, it } from "vitest";
import { shownWeights, tasteView } from "./view";

describe("tasteView", () => {
  it("leaves venue kinds and occasions out of likes and dislikes", () => {
    const view = tasteView({
      userId: "00000000-0000-4000-8000-000000000000",
      weights: { "amenity:bar": 0.9, "attr:restaurant": 0.8, "attr:cafe": -0.6, "amenity:cafe": -0.5, "occasion:casual": 0.4, "cuisine:ramen": 0.6, "vibe:loud": -0.3, "price:2": 0.2 },
      summary: "",
      summaryEdited: false,
      updatedAt: 1,
    });
    expect(view.likes.map(([k]) => k)).toEqual(["cuisine:ramen", "price:2"]);
    expect(view.dislikes.map(([k]) => k)).toEqual(["vibe:loud"]);
  });

  it("is empty without a profile", () => {
    expect(tasteView(null)).toEqual({ summary: "", summaryEdited: false, likes: [], dislikes: [], updatedAt: null });
  });

  it("keeps every other family", () => {
    expect(Object.keys(shownWeights({ "dish:dumplings": 0.3, "attr:outdoor_seating": 0.2, "amenity:pub": 0.1, "attr:pub": 0.1 }))).toEqual(["dish:dumplings", "attr:outdoor_seating"]);
  });
});
