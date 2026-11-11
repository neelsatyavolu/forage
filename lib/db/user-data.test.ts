import { beforeEach, describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import type { Place } from "../types";
import type { Db } from "./client";
import { deleteLodestarLink, getLodestarLink, saveLodestarLink } from "./links";
import { insertPrediction, latestPrediction, listResolvedPredictions, resolvePrediction } from "./predictions";
import { getTasteProfile, resetTasteSummary, saveTasteSummary, saveTasteWeights } from "./taste";
import { deleteUser } from "./users";
import { addWant, isWanted, listWant, removeWant } from "./want";

let db: Db;
let place: Place;

beforeEach(async () => {
  db = await freshDb();
  place = await addPlace(db);
});

describe("want list", () => {
  it("adds once, lists, and removes per user", async () => {
    expect(await addWant(db, USER_A, place.id, "manual", 1)).toEqual({ userId: USER_A, placeId: place.id, addedAt: 1, source: "manual" });
    expect((await addWant(db, USER_A, place.id, "rec", 2)).source).toBe("manual");
    expect(await isWanted(db, USER_A, place.id)).toBe(true);
    expect(await isWanted(db, USER_B, place.id)).toBe(false);
    expect(await listWant(db, USER_A)).toHaveLength(1);
    expect(await removeWant(db, USER_A, place.id)).toBe(true);
    expect(await listWant(db, USER_A)).toEqual([]);
  });
});

describe("taste profile", () => {
  it("keeps weights and summary independent, and never lets the AI overwrite a user edit", async () => {
    expect(await getTasteProfile(db, USER_A)).toBeNull();
    await saveTasteWeights(db, USER_A, { "cuisine:ramen": 0.8 }, 1);
    await saveTasteSummary(db, USER_A, "Likes noodles.", false, 2);
    expect(await getTasteProfile(db, USER_A)).toEqual({ userId: USER_A, weights: { "cuisine:ramen": 0.8 }, summary: "Likes noodles.", summaryEdited: false, updatedAt: 2 });
    await saveTasteSummary(db, USER_A, "Loves hand-pulled noodles.", true, 3);
    await saveTasteSummary(db, USER_A, "AI rewrite.", false, 4);
    await saveTasteWeights(db, USER_A, { "cuisine:ramen": 0.9 }, 5);
    expect(await getTasteProfile(db, USER_A)).toMatchObject({ summary: "Loves hand-pulled noodles.", summaryEdited: true, weights: { "cuisine:ramen": 0.9 } });
    await resetTasteSummary(db, USER_A, 6);
    expect(await getTasteProfile(db, USER_A)).toMatchObject({ summary: "", summaryEdited: false });
  });
});

describe("predictions", () => {
  it("resolves the newest open prediction for a place", async () => {
    await insertPrediction(db, USER_A, place.id, 7, 7, 1);
    const newer = await insertPrediction(db, USER_A, place.id, 8.4, 9, 2);
    expect((await latestPrediction(db, USER_A, place.id))?.id).toBe(newer.id);
    expect(await resolvePrediction(db, USER_A, place.id, 7.1)).toMatchObject({ id: newer.id, predicted: 8.4, rawPredicted: 9, actual: 7.1 });
    expect(await listResolvedPredictions(db, USER_A)).toHaveLength(1);
    expect(await resolvePrediction(db, USER_B, place.id, 5)).toBeNull();
  });
});

describe("lodestar link", () => {
  it("saves, refreshes tokens keeping the label, and deletes", async () => {
    await saveLodestarLink(db, USER_A, "v1.first", "ada@example.com", 1);
    await saveLodestarLink(db, USER_A, "v1.second", null, 2);
    expect(await getLodestarLink(db, USER_A)).toEqual({ userId: USER_A, sealedTokens: "v1.second", lodestarUserLabel: "ada@example.com", createdAt: 1 });
    expect(await deleteLodestarLink(db, USER_A)).toBe(true);
    expect(await getLodestarLink(db, USER_A)).toBeNull();
  });
});

describe("account deletion", () => {
  it("takes every user row with it", async () => {
    await addWant(db, USER_A, place.id, "manual", 1);
    await saveTasteWeights(db, USER_A, {}, 1);
    await insertPrediction(db, USER_A, place.id, 5, 5, 1);
    await saveLodestarLink(db, USER_A, "v1.x", null, 1);
    await deleteUser(db, USER_A);
    for (const table of ["want_list", "taste_profiles", "predictions", "lodestar_links"]) {
      expect(await db.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [USER_A])).toEqual([]);
    }
  });
});
