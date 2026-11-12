// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/types";
import type { Candidate } from "./flow";
import { useRateFlow, type RateFlowModel } from "./use-rate-flow";

vi.mock("./api", () => ({
  getAccount: vi.fn(async () => ({ user: { email: null, guest: true, createdAt: 0 }, progress: { rated: 0, firstPicksAt: 5, goal: 10 } })),
  getProgress: vi.fn(async () => ({ rated: 1, firstPicksAt: 5, goal: 10 })),
  rate: vi.fn(),
  editVisit: vi.fn(),
  answer: vi.fn(),
  nextOpponent: vi.fn(),
}));
import * as call from "./api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const place = (id: string): Place => ({
  id, name: id, source: "osm", sourceId: id, googlePlaceId: null, lat: 37.78, lng: -122.42, address: null, city: null, country: null, cuisine: [], priceLevel: null, tags: {}, updatedAt: 0,
});
const cand = (id: string): Candidate => ({ place: place(id), kind: "Cafe", distanceKm: 0.2, occasion: "quick" });
const visit = (id: string) => ({ id, placeId: "a", reaction: "loved", rating: null, occasion: "quick" });

let root: Root;
let f: RateFlowModel;
const keep = (model: RateFlowModel) => {
  f = model;
};
function Probe({ onModel }: { onModel: (m: RateFlowModel) => void }) {
  onModel(useRateFlow());
  return null;
}

beforeEach(async () => {
  vi.mocked(call.rate).mockResolvedValue({ visit: visit("v1"), score: 8.4, opponent: place("b"), asked: 0 } as never);
  vi.mocked(call.editVisit).mockResolvedValue({ visit: visit("v1"), score: 8.4 } as never);
  vi.mocked(call.answer).mockResolvedValue({ id: 1, score: 8.8, subjectScore: 8.8, opponent: null, asked: 1 } as never);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe, { onModel: keep })));
});
afterEach(() => act(() => root.unmount()));

async function rateFirstPlace() {
  await act(async () => f.toggleBeen(cand("a")));
  await act(async () => f.start());
  await act(async () => f.react("loved", null));
}

describe("useRateFlow notices", () => {
  it("opens the question unlocked after details were saved", async () => {
    await rateFirstPlace();
    await act(async () => f.saveDetails({ note: "Good" }));
    expect(f.notice).toBe("Details saved");

    await act(async () => f.next());
    expect(f.step).toBe("compare");
    expect(f.notice).toBeNull();
    expect(f.scored).toBeNull();
  });

  it("locks the question with the new score once answered, separate from the details notice", async () => {
    await rateFirstPlace();
    await act(async () => f.next());
    await act(async () => f.choose(place("a")));
    expect(f.scored).toBe("a is now 8.8");
    expect(f.notice).toBeNull();
  });
});
