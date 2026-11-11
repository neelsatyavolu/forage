import { beforeEach, describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import type { Place } from "../types";
import type { Db } from "./client";
import { deleteComparisonsFor, deleteScore, getScore, insertComparison, listComparisons, listScores, saveScores } from "./scores";

let db: Db;
let a: Place;
let b: Place;

beforeEach(async () => {
  db = await freshDb();
  a = await addPlace(db);
  b = await addPlace(db, { sourceId: "node/2", name: "Other" });
});

describe("comparisons", () => {
  it("records, lists per user and occasion, and clears for a place", async () => {
    const c = await insertComparison(db, USER_A, { winnerPlaceId: a.id, loserPlaceId: b.id, occasion: "casual" }, 1);
    expect(c).toMatchObject({ userId: USER_A, winnerPlaceId: a.id, loserPlaceId: b.id, occasion: "casual", createdAt: 1 });
    await insertComparison(db, USER_A, { winnerPlaceId: b.id, loserPlaceId: a.id, occasion: "quick" }, 2);
    await insertComparison(db, USER_B, { winnerPlaceId: b.id, loserPlaceId: a.id, occasion: "casual" }, 3);
    expect(await listComparisons(db, USER_A)).toHaveLength(2);
    expect((await listComparisons(db, USER_A, "casual")).map((x) => x.id)).toEqual([c.id]);
    await deleteComparisonsFor(db, USER_A, a.id);
    expect(await listComparisons(db, USER_A)).toEqual([]);
    expect(await listComparisons(db, USER_B)).toHaveLength(1);
  });

  it("refuses a place against itself", async () => {
    await expect(insertComparison(db, USER_A, { winnerPlaceId: a.id, loserPlaceId: a.id, occasion: "casual" }, 1)).rejects.toThrow();
  });
});

describe("place scores", () => {
  it("upserts a refit and lists highest first", async () => {
    await saveScores(db, USER_A, "casual", [{ placeId: a.id, score: 6 }, { placeId: b.id, score: 8 }], 1);
    await saveScores(db, USER_A, "casual", [{ placeId: a.id, score: 9.5 }], 2);
    await saveScores(db, USER_A, "quick", [{ placeId: a.id, score: 3 }], 2);
    expect((await listScores(db, USER_A, "casual")).map((s) => [s.placeId, s.score])).toEqual([[a.id, 9.5], [b.id, 8]]);
    expect(await listScores(db, USER_A)).toHaveLength(3);
    expect(await getScore(db, USER_A, a.id, "quick")).toEqual({ userId: USER_A, placeId: a.id, occasion: "quick", score: 3, updatedAt: 2 });
    expect(await listScores(db, USER_B)).toEqual([]);
    await deleteScore(db, USER_A, a.id);
    expect((await listScores(db, USER_A)).map((s) => s.placeId)).toEqual([b.id]);
  });

  it("refuses a score outside 0-10", async () => {
    await expect(saveScores(db, USER_A, "casual", [{ placeId: a.id, score: 11 }], 1)).rejects.toThrow();
  });
});
