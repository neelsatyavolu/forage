import { describe, expect, it, vi } from "vitest";
import { getPlace } from "../db/places";
import { getTasteProfile, saveTasteSummary } from "../db/taste";
import { insertVisit } from "../db/visits";
import { addPlace, freshDb, USER_A } from "../../test/db";
import type { AskAi } from "./ai";
import { cardPrompt, cardTags, hasAiCard } from "./card";
import { refreshTaste } from "./refresh";
import { plainSummary, summaryPrompt } from "./summary";

const NOW = Date.parse("2026-11-11T12:00:00Z");

/** A fake AI that answers by which prompt it got. */
const fakeAi = (summary = "Loves noodles.") =>
  vi.fn(async ({ system, schema }: { system: string; prompt: string; schema: { parse: (x: unknown) => unknown } }) =>
    schema.parse(
      system.includes("feature cards")
        ? { cards: [{ id: "p1", dishes: ["dan dan noodles", "wontons"], vibe: ["casual"], attributes: ["spicy"], occasions: ["casual", "bogus"], description: "A noodle shop." }, { id: "p99", dishes: [] }] }
        : { summary },
    ),
  ) as unknown as AskAi & ReturnType<typeof vi.fn>;

async function seeded() {
  const db = await freshDb();
  const place = await addPlace(db, { tags: { attributes: ["restaurant"], dishes: ["dan dan noodles"], description: "From OSM." } });
  await insertVisit(db, USER_A, { placeId: place.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "casual", dishes: ["cucumbers"], note: "secret: my birthday" }, 1);
  return { db, place };
}

describe("cards", () => {
  it("builds prompts from public facts only", async () => {
    const { place } = await seeded();
    const prompt = cardPrompt([place]);
    expect(prompt).toContain("name: Mian");
    expect(prompt).toContain("map tags: restaurant");
    expect(prompt).not.toContain("birthday");
  });

  it("merges into existing tags without replacing them", async () => {
    const { place } = await seeded();
    const tags = cardTags(place, { id: "p1", dishes: ["wontons"], vibe: [], attributes: [], occasions: [], description: "x" }, 5);
    expect(tags).toMatchObject({ dishes: ["dan dan noodles", "wontons"], cardSource: "ai", cardAt: 5 });
    expect(tags).not.toHaveProperty("aiDescription");
  });
});

describe("refreshTaste", () => {
  it("without AI only recomputes weights", async () => {
    const { db } = await seeded();
    const r = await refreshTaste(db, USER_A, null, NOW);
    expect(r.cardsWritten).toBe(0);
    expect(r.profile.weights["dish:cucumbers"]).toBeGreaterThan(0);
    expect(r.profile.summary).toBe("");
  });

  it("with AI writes cards (once) and the summary", async () => {
    const { db, place } = await seeded();
    const ai = fakeAi();
    const r = await refreshTaste(db, USER_A, ai, NOW);
    expect(r).toMatchObject({ cardsWritten: 1, summaryWritten: true });
    expect(r.profile.summary).toBe("Loves noodles.");
    expect(r.profile.weights["attr:spicy"]).toBeGreaterThan(0);
    const stored = await getPlace(db, place.id);
    expect(stored && hasAiCard(stored)).toBe(true);
    expect(stored?.tags).toMatchObject({ description: "From OSM.", occasions: ["casual"] });

    ai.mockClear();
    await refreshTaste(db, USER_A, ai, NOW);
    expect(ai).toHaveBeenCalledTimes(1); // summary only; the card is cached
  });

  it("never overwrites a summary the user edited", async () => {
    const { db } = await seeded();
    await saveTasteSummary(db, USER_A, "Mine.", true, 1);
    const r = await refreshTaste(db, USER_A, fakeAi(), NOW);
    expect(r.summaryWritten).toBe(false);
    expect((await getTasteProfile(db, USER_A))?.summary).toBe("Mine.");
  });
});

describe("summary helpers", () => {
  it("writes a plain summary from weights", () => {
    expect(plainSummary({ "cuisine:ramen": 0.9, "vibe:scene": -0.6 })).toBe("Likes ramen. Dislikes scene.");
    expect(plainSummary({})).toBe("");
  });

  it("lists the user's places in the prompt", async () => {
    const { db } = await seeded();
    const { profile } = await refreshTaste(db, USER_A, null, NOW);
    const { loadHistory } = await import("./history");
    const prompt = summaryPrompt(await loadHistory(db, USER_A), profile.weights);
    expect(prompt).toContain("- Mian (chinese, noodles): loved; ordered cucumbers");
  });
});
