import { beforeEach, describe, expect, it } from "vitest";
import { deriveKey } from "../ai/seal";
import type { Db } from "../db/client";
import { getTasteProfile } from "../db/taste";
import { getTasteSeed } from "../db/taste-seeds";
import { insertVisit } from "../db/visits";
import { addPlace, freshDb, USER_A } from "../../test/db";
import { refreshWeights } from "../taste/refresh";
import { SEED_WEIGHT, seedWeights } from "../taste/seed";
import { lodestarClient } from "./client";
import { fakeFetch, json, toolAnswer } from "./fake";
import { importPreferencesWith } from "./import";
import { toSeed, type LodestarPreferences } from "./preferences";
import { dbTokenSource, saveTokens } from "./store";
import type { Tokens } from "./tokens";

const MCP = "https://lodestar.example/api/mcp";
const key = deriveKey("a-test-secret-of-length", "lodestar-tokens");
const NOW = Date.parse("2026-11-11T12:00:00Z");
const good: Tokens = { accessToken: "lsa_1", refreshToken: "lsr_1", expiresAt: NOW + 3600_000 };
const PREFS: LodestarPreferences = { cuisines: ["Japanese", "Thai", "japanese"], dietary: ["Vegetarian", "Gluten-free", "no onions"], diningBudget: "$$", homeAirports: ["SFO"] };

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  await saveTokens(db, key, USER_A, good, "lodestar.example", NOW);
});

function client(answer: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(answer);
  let refreshes = 0;
  const tokens = dbTokenSource(db, key, USER_A, async () => {
    refreshes++;
    return { accessToken: "lsa_2", refreshToken: "lsr_2", expiresAt: NOW + 7200_000 };
  }, () => NOW);
  return { f, client: lodestarClient({ fetch: f.fetch, mcpUrl: MCP, tokens, now: () => NOW }), refreshes: () => refreshes };
}

describe("getPreferences", () => {
  it("calls get_preferences with no arguments and validates the answer", async () => {
    const { f, client: c } = client((_u, init) => json(toolAnswer(init, PREFS)));
    expect(await c.getPreferences()).toEqual(PREFS);
    expect(JSON.parse(String(f.calls[0].init.body)).params).toEqual({ name: "get_preferences", arguments: {} });
  });

  it("refreshes once on 401 and retries", async () => {
    const { f, client: c, refreshes } = client((_u, init, n) => (n === 1 ? new Response("", { status: 401 }) : json(toolAnswer(init, PREFS))));
    expect((await c.getPreferences()).diningBudget).toBe("$$");
    expect(refreshes()).toBe(1);
    expect((f.calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer lsa_2");
  });

  it("passes on Lodestar's refusal and rejects a malformed answer", async () => {
    const refused = client((_u, init) => json(toolAnswer(init, null, { isError: true, text: "Not signed in to Lodestar." })));
    await expect(refused.client.getPreferences()).rejects.toMatchObject({ code: "tool", message: "Not signed in to Lodestar." });
    const bad = client((_u, init) => json(toolAnswer(init, { ...PREFS, diningBudget: "cheap" })));
    await expect(bad.client.getPreferences()).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("toSeed", () => {
  it("slugs cuisines, maps known diets to OSM keys and the budget to a ceiling", () => {
    expect(toSeed(PREFS)).toEqual({ cuisines: ["japanese", "thai"], dietary: ["vegetarian", "gluten_free"], priceCeiling: 2 });
    expect(toSeed({ cuisines: [], dietary: [], diningBudget: null, homeAirports: [] }).priceCeiling).toBeNull();
    expect(toSeed({ ...PREFS, diningBudget: "$$$$" }).priceCeiling).toBe(4);
  });
});

describe("seedWeights", () => {
  it("raises only missing or weak positive cuisine weights", () => {
    const weights = { "cuisine:thai": 0.9, "cuisine:korean": -0.6, "cuisine:pizza": 0.1, "vibe:cozy": 0.3 };
    const seed = { cuisines: ["thai", "korean", "pizza", "japanese"], dietary: [], priceCeiling: null };
    expect(seedWeights(weights, seed)).toEqual({ "cuisine:thai": 0.9, "cuisine:korean": -0.6, "cuisine:pizza": SEED_WEIGHT, "vibe:cozy": 0.3, "cuisine:japanese": SEED_WEIGHT });
    expect(seedWeights(weights, null)).toBe(weights);
  });
});

describe("importPreferencesWith", () => {
  it("stores the seed and folds liked cuisines into the weights without lowering visit-derived ones", async () => {
    const thai = await addPlace(db, { sourceId: "node/1", name: "Thai Spot", cuisine: ["thai"] });
    const other = await addPlace(db, { sourceId: "node/2", name: "Diner", cuisine: ["diner"] });
    await insertVisit(db, USER_A, { placeId: thai.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "casual", dishes: [], note: null }, 1);
    await insertVisit(db, USER_A, { placeId: other.id, visitedOn: "2026-11-01", reaction: "disliked", occasion: "casual", dishes: [], note: null }, 1);
    const before = (await refreshWeights(db, USER_A, NOW)).profile.weights["cuisine:thai"];
    expect(before).toBeGreaterThan(SEED_WEIGHT);

    const { client: c } = client((_u, init) => json(toolAnswer(init, PREFS)));
    expect(await importPreferencesWith(db, c, USER_A, NOW)).toEqual(toSeed(PREFS));
    expect(await getTasteSeed(db, USER_A)).toEqual(toSeed(PREFS));
    const weights = (await getTasteProfile(db, USER_A))!.weights;
    expect(weights["cuisine:japanese"]).toBe(SEED_WEIGHT);
    expect(weights["cuisine:thai"]).toBe(before);
    // Seeds survive the recompute every recommendation does.
    expect((await refreshWeights(db, USER_A, NOW)).profile.weights["cuisine:japanese"]).toBe(SEED_WEIGHT);
  });
});
