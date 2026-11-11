import { describe, expect, it } from "vitest";
import { parseDishes, today } from "./options";

describe("parseDishes", () => {
  it("splits, trims, drops blanks and repeats", () => {
    expect(parseDishes(" ramen, gyoza ,, ramen ")).toEqual(["ramen", "gyoza"]);
    expect(parseDishes("")).toEqual([]);
  });
});

describe("today", () => {
  it("is a calendar day", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
