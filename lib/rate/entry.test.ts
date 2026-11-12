import { describe, expect, it } from "vitest";
import { dismissCookie, progressLine, RATE_DISMISSED_COOKIE, shouldOpenRate } from "./entry";

describe("shouldOpenRate", () => {
  it("opens the flow under 10 rated unless it was closed", () => {
    expect(shouldOpenRate(0, false)).toBe(true);
    expect(shouldOpenRate(9, false)).toBe(true);
    expect(shouldOpenRate(10, false)).toBe(false);
    expect(shouldOpenRate(3, true)).toBe(false);
  });
});

describe("dismissCookie", () => {
  it("is a site-wide 30-day cookie", () => {
    expect(dismissCookie()).toBe(`${RATE_DISMISSED_COOKIE}=1; Max-Age=2592000; Path=/; SameSite=Lax`);
  });
});

describe("progressLine", () => {
  it("counts toward first picks, then toward 10, then hides", () => {
    expect(progressLine(2)).toEqual({ count: "2 of 5", note: "Rate 3 more to get picks" });
    expect(progressLine(4)).toEqual({ count: "4 of 5", note: "Rate 1 more to get picks" });
    expect(progressLine(6)).toEqual({ count: "6 of 10", note: "Picks get better as you rate" });
    expect(progressLine(10)).toBeNull();
  });
});
