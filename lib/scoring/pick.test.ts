import { describe, expect, it } from "vitest";
import { pickOpponent } from "./pick";

const subject = { id: "new", reaction: "loved" as const, score: 8.5 };

describe("pickOpponent", () => {
  it("picks the same-band place with the closest score", () => {
    const others = [
      { id: "far", reaction: "loved" as const, score: 9.6 },
      { id: "near", reaction: "loved" as const, score: 8.3 },
      { id: "other-band", reaction: "fine" as const, score: 8.5 },
    ];
    expect(pickOpponent(subject, others, new Set())).toBe("near");
  });

  it("skips excluded places and the subject itself", () => {
    const others = [
      { id: "new", reaction: "loved" as const, score: 8.5 },
      { id: "asked", reaction: "loved" as const, score: 8.4 },
      { id: "next", reaction: "loved" as const, score: 7.9 },
    ];
    expect(pickOpponent(subject, others, new Set(["asked"]))).toBe("next");
  });

  it("returns null when no place shares the band", () => {
    expect(pickOpponent(subject, [{ id: "x", reaction: "disliked", score: 3 }], new Set())).toBeNull();
  });

  it("breaks ties by id so the choice is stable", () => {
    const others = [
      { id: "b", reaction: "loved" as const, score: 9 },
      { id: "a", reaction: "loved" as const, score: 8 },
    ];
    expect(pickOpponent(subject, others, new Set())).toBe("a");
  });
});
