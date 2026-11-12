import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "@/test/db";
import { insertComparison, listScores } from "../db/scores";
import { deleteVisit, insertVisit } from "../db/visits";
import type { Reaction } from "../types";
import { nextOpponent, refitOccasion } from "./refit";

async function setup() {
  const db = await freshDb();
  const [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map((n) => addPlace(db, { sourceId: `node/${n}`, name: n })));
  const log = (userId: string, placeId: string, reaction: Reaction, occasion: "casual" | "special" = "casual") =>
    insertVisit(db, userId, { placeId, visitedOn: "2026-11-01", reaction, occasion, dishes: [], note: null }, 1000);
  return { db, a, b, c, d, log };
}

describe("refitOccasion", () => {
  it("saves band priors, then moves scores after a comparison", async () => {
    const { db, a, b, log } = await setup();
    await log(USER_A, a.id, "loved");
    await log(USER_A, b.id, "loved");
    const before = await refitOccasion(db, USER_A, "casual", 2000);
    expect(before.get(a.id)).toBe(8.5);
    await insertComparison(db, USER_A, { winnerPlaceId: b.id, loserPlaceId: a.id, occasion: "casual" }, 3000);
    await refitOccasion(db, USER_A, "casual", 4000);
    const saved = await listScores(db, USER_A, "casual");
    expect(saved.map((s) => s.placeId)).toEqual([b.id, a.id]);
  });

  it("keeps occasions and users apart", async () => {
    const { db, a, b, log } = await setup();
    await log(USER_A, a.id, "loved", "casual");
    await log(USER_A, b.id, "disliked", "special");
    await log(USER_B, a.id, "fine", "casual");
    await refitOccasion(db, USER_A, "casual", 1);
    expect((await listScores(db, USER_A)).map((s) => s.placeId)).toEqual([a.id]);
    expect(await listScores(db, USER_B)).toEqual([]);
  });

  it("uses the latest visit's reaction and drops scores of deleted visits", async () => {
    const { db, a, log } = await setup();
    const first = await log(USER_A, a.id, "disliked");
    await insertVisit(db, USER_A, { placeId: a.id, visitedOn: "2026-11-05", reaction: "loved", occasion: "casual", dishes: [], note: null }, 2000);
    expect((await refitOccasion(db, USER_A, "casual", 1)).get(a.id)).toBe(8.5);
    await deleteVisit(db, USER_A, first.id);
    const visits = await db.query("SELECT id FROM visits WHERE user_id = $1", [USER_A]);
    await deleteVisit(db, USER_A, visits[0].id as string);
    await refitOccasion(db, USER_A, "casual", 2);
    expect(await listScores(db, USER_A, "casual")).toEqual([]);
  });
});

describe("nextOpponent", () => {
  it("asks about the closest place in the same band, never twice", async () => {
    const { db, a, b, c, d, log } = await setup();
    await log(USER_A, a.id, "loved");
    await log(USER_A, b.id, "loved");
    await log(USER_A, c.id, "loved");
    await log(USER_A, d.id, "disliked");
    await insertComparison(db, USER_A, { winnerPlaceId: b.id, loserPlaceId: c.id, occasion: "casual" }, 1);
    await refitOccasion(db, USER_A, "casual", 1);
    // a sits at 8.5; b moved up and c down by the same amount, so the tie breaks by id.
    const first = await nextOpponent(db, USER_A, a.id, "casual");
    expect([b.id, c.id]).toContain(first);
    await insertComparison(db, USER_A, { winnerPlaceId: a.id, loserPlaceId: first!, occasion: "casual" }, 2);
    await refitOccasion(db, USER_A, "casual", 2);
    const second = await nextOpponent(db, USER_A, a.id, "casual");
    expect(second).toBe(first === b.id ? c.id : b.id);
    await insertComparison(db, USER_A, { winnerPlaceId: a.id, loserPlaceId: second!, occasion: "casual" }, 3);
    expect(await nextOpponent(db, USER_A, a.id, "casual")).toBeNull();
  });

  it("is null for a place not logged in that occasion", async () => {
    const { db, a } = await setup();
    expect(await nextOpponent(db, USER_A, a.id, "casual")).toBeNull();
  });

  it("uses the rating of the place's latest visit", async () => {
    const { db, a } = await setup();
    await insertVisit(db, USER_A, { placeId: a.id, visitedOn: "2026-10-01", reaction: "loved", occasion: "casual", rating: 10, dishes: [], note: null }, 1000);
    await insertVisit(db, USER_A, { placeId: a.id, visitedOn: "2026-11-01", reaction: "fine", occasion: "casual", rating: 7, dishes: [], note: null }, 1000);
    expect((await refitOccasion(db, USER_A, "casual", 2000)).get(a.id)).toBe(7);
  });
});
