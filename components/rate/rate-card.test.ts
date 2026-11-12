// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Place } from "@/lib/types";
import { RateCard } from "./rate-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const place = (id: string): Place => ({
  id, name: id, source: "osm", sourceId: id, googlePlaceId: null, lat: 37.78, lng: -122.42, address: null, city: null, country: null, cuisine: [], priceLevel: null, tags: {}, updatedAt: 0,
});
const noop = () => undefined;
const card = (p: Place) =>
  createElement(RateCard, {
    place: p, kind: "Cafe", distanceKm: null, occasion: "quick", state: { reaction: "loved", rating: null, score: 8 }, busy: false,
    occasionOpen: false, onOccasionOpen: noop, onReact: noop, onOccasion: noop, onDetails: noop,
  });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

describe("RateCard details", () => {
  it("closes the details form when the card moves to another place", async () => {
    await act(async () => root.render(card(place("a"))));
    await act(async () => button("Add details")!.click());
    expect(host.querySelector("textarea")).not.toBeNull();

    await act(async () => root.render(card(place("b"))));
    expect(host.querySelector("textarea")).toBeNull();
    expect(button("Add details")).toBeDefined();
  });
});
