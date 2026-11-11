import { describe, expect, it, vi } from "vitest";
import { AiError } from "../ai/errors";
import { insertVisit } from "../db/visits";
import { addWant } from "../db/want";
import { getTasteProfile } from "../db/taste";
import { latestPrediction } from "../db/predictions";
import { addPlace, freshDb, USER_A } from "../../test/db";
import type { AskAi } from "../taste/ai";
import type { Place, RecContext } from "../types";
import { recommendWith, type RecDeps } from "./engine";
import { applyRerank, candidateLine, rerankPrompt } from "./rerank";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const CTX: RecContext = { lat: 37.77, lng: -122.42, radiusKm: 3, mode: "near" };

async function world() {
  const db = await freshDb();
  const mian = await addPlace(db, { sourceId: "node/1", name: "Mian", cuisine: ["noodles", "chinese"] });
  const steak = await addPlace(db, { sourceId: "node/2", name: "Prime", cuisine: ["steak_house"], priceLevel: 4 });
  const noodle2 = await addPlace(db, { sourceId: "node/3", name: "Noodle Bar", cuisine: ["noodles"], lat: 37.771 });
  const grill = await addPlace(db, { sourceId: "node/4", name: "Grill House", cuisine: ["steak_house"], lat: 37.772, priceLevel: 4 });
  const cafe = await addPlace(db, { sourceId: "node/5", name: "Cafe", cuisine: ["coffee_shop"], lat: 37.773 });
  const visit = (placeId: string, reaction: "loved" | "disliked") =>
    insertVisit(db, USER_A, { placeId, visitedOn: "2026-11-01", reaction, occasion: "casual", dishes: [], note: null }, 1);
  await visit(mian.id, "loved");
  await visit(steak.id, "disliked");
  const nearby = vi.fn(async (): Promise<Place[]> => [noodle2, grill, cafe, mian]);
  const deps = (ai: AskAi | null = null): RecDeps => ({ db, nearby, ai, now: NOW });
  return { db, deps, mian, noodle2, grill, cafe };
}

const aiAnswering = (picks: { id: string; reason: string }[]) =>
  vi.fn(async ({ schema }: { schema: { parse: (x: unknown) => unknown } }) => schema.parse({ picks })) as unknown as AskAi;

describe("recommendWith", () => {
  it("without AI ranks new places by taste and saves the weights", async () => {
    const { db, deps, noodle2 } = await world();
    const recs = await recommendWith(deps(), USER_A, CTX);
    expect(recs[0].place.id).toBe(noodle2.id);
    expect(recs.at(-1)?.place.name).toBe("Grill House");
    expect(recs.every((r) => !r.signals.visited && r.reason === undefined)).toBe(true);
    expect((await getTasteProfile(db, USER_A))?.weights["cuisine:noodles"]).toBeGreaterThan(0);
    expect((await latestPrediction(db, USER_A, noodle2.id))?.predicted).toBe(recs[0].score);
  });

  it("stores the uncalibrated prediction beside the calibrated one shown", async () => {
    const { db, deps, cafe } = await world();
    // Six resolved misses of -3 give a calibration of -2 (clamped).
    for (let i = 0; i < 6; i++) {
      await db.query("INSERT INTO predictions (user_id, place_id, predicted, raw_predicted, actual, created_at) VALUES ($1, $2, 8, 8, 5, '2026-10-01T00:00:00Z')", [USER_A, cafe.id]);
    }
    const recs = await recommendWith(deps(), USER_A, CTX);
    const stored = await latestPrediction(db, USER_A, recs[0].place.id);
    expect(stored?.predicted).toBe(recs[0].score);
    expect(stored?.rawPredicted).toBeCloseTo(recs[0].score + 2, 1);
  });

  it("makes no paid calls: only the place source is asked, and crowd quality stays neutral", async () => {
    const { deps } = await world();
    const d = deps();
    const recs = await recommendWith(d, USER_A, { ...CTX, mode: "travel" });
    expect(d.nearby).toHaveBeenCalledOnce();
    expect(Object.keys(d).sort()).toEqual(["ai", "db", "nearby", "now"]);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.signals.quality === null)).toBe(true);
  });

  it("Go-to returns places you've been, even when the source didn't list them", async () => {
    const { deps, mian } = await world();
    const d = deps();
    d.nearby = async () => [];
    const recs = await recommendWith(d, USER_A, CTX, { filter: "goto" });
    expect(recs.map((r) => r.place.id)).toEqual([mian.id]);
  });

  it("marks the want list", async () => {
    const { db, deps, cafe } = await world();
    await addWant(db, USER_A, cafe.id, "manual", 1);
    const recs = await recommendWith(deps(), USER_A, CTX);
    expect(recs.find((r) => r.place.id === cafe.id)?.signals.wanted).toBe(true);
  });

  it("with AI puts its picks first with reasons and drops unknown ids", async () => {
    const { deps, cafe } = await world();
    // Fast order: c1 Noodle Bar, c2 Cafe, c3 Grill House.
    const ai = aiAnswering([{ id: "c2", reason: "Like Mian, but for coffee.\nextra line" }, { id: "c99", reason: "made up" }, { id: "c2", reason: "dup" }]);
    const recs = await recommendWith(deps(ai), USER_A, { ...CTX, want: "coffee" });
    expect(recs[0]).toMatchObject({ place: { id: cafe.id }, reason: "Like Mian, but for coffee." });
    expect(recs).toHaveLength(3);
    expect(recs.slice(1).every((r) => r.reason === undefined)).toBe(true);
  });

  it("falls back to the fast ranking when the AI fails", async () => {
    const { deps, noodle2 } = await world();
    const ai = vi.fn(async () => {
      throw new AiError("upstream", "down");
    }) as unknown as AskAi;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recs = await recommendWith(deps(ai), USER_A, CTX);
    expect(recs[0].place.id).toBe(noodle2.id);
  });

  it("Ask needs AI, returns only its picks, and surfaces AI errors", async () => {
    const { deps } = await world();
    await expect(recommendWith(deps(), USER_A, CTX, { requireAi: true, picks: 3 })).rejects.toMatchObject({ code: "not_connected" });
    const recs = await recommendWith(deps(aiAnswering([{ id: "c1", reason: "a" }, { id: "c3", reason: "b" }])), USER_A, CTX, { requireAi: true, picks: 3 });
    expect(recs.map((r) => r.reason)).toEqual(["a", "b"]);
    await expect(recommendWith(deps(aiAnswering([{ id: "zz", reason: "x" }])), USER_A, CTX, { requireAi: true })).rejects.toMatchObject({ code: "bad_output" });
  });
});

describe("rerank prompt", () => {
  it("shows candidates by short id with compact facts and the user's places", async () => {
    const { deps } = await world();
    const recs = await recommendWith(deps(), USER_A, CTX);
    const line = candidateLine("c1", recs[0]);
    expect(line).toMatch(/^c1 \| Noodle Bar \| noodles \| \$\$ \| 0\.\d km/);
    const prompt = rerankPrompt(recs, [], "Loves noodles.", { ...CTX, want: "spicy", partySize: 2, occasion: "casual" }, 3);
    expect(prompt).toContain("Taste summary: Loves noodles.");
    expect(prompt).toContain("They want: spicy");
    expect(prompt).toContain("Party of 2");
    expect(prompt).toContain("Pick the best 3.");
    expect(applyRerank(recs, { picks: [] }, false)).toEqual([]);
  });
});
