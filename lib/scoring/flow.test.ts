import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "@/test/db";
import { listScores } from "../db/scores";
import type { Reaction } from "../types";
import { addSkip, recentSkips } from "../db/skips";
import { answerComparison, editVisit, logVisit, removeVisit, step, undoComparison } from "./flow";

const visit = (placeId: string, reaction: Reaction, occasion: "casual" | "special" = "casual", rating: number | null = null) => ({ placeId, visitedOn: "2026-11-10", reaction, occasion, rating, dated: true, dishes: [], note: null });

async function setup() {
  const db = await freshDb();
  const places = await Promise.all(["a", "b", "c"].map((n) => addPlace(db, { sourceId: `node/${n}`, name: n })));
  return { db, places };
}

describe("logging flow", () => {
  it("asks no question for the first place, then one against the same band", async () => {
    const { db, places: [a, b, c] } = await setup();
    const first = await logVisit(db, USER_A, visit(a.id, "loved"), 1);
    expect(first).toMatchObject({ score: 8.5, opponent: null, asked: 0 });
    await logVisit(db, USER_A, visit(c.id, "disliked"), 2);
    const second = await logVisit(db, USER_A, visit(b.id, "loved"), 3);
    expect(second.opponent?.id).toBe(a.id);
  });

  it("stops after two answers and moves the scores", async () => {
    const { db, places: [a, b, c] } = await setup();
    await logVisit(db, USER_A, visit(a.id, "loved"), 1);
    await logVisit(db, USER_A, visit(b.id, "loved"), 2);
    const logged = await logVisit(db, USER_A, visit(c.id, "loved"), 3);
    const opp1 = logged.opponent!;
    const s1 = await answerComparison(db, USER_A, { winnerPlaceId: c.id, loserPlaceId: opp1.id, occasion: "casual" }, { subjectPlaceId: c.id, asked: 1 }, 4);
    expect(s1.score).toBeGreaterThan(8.5);
    expect(s1.opponent).not.toBeNull();
    expect(s1.opponent!.id).not.toBe(opp1.id);
    const s2 = await answerComparison(db, USER_A, { winnerPlaceId: c.id, loserPlaceId: s1.opponent!.id, occasion: "casual" }, { subjectPlaceId: c.id, asked: 2 }, 5);
    expect(s2.opponent).toBeNull();
    expect((await listScores(db, USER_A, "casual"))[0].placeId).toBe(c.id);
  });

  it("refuses comparisons with places not logged for that occasion or by that user", async () => {
    const { db, places: [a, b] } = await setup();
    await logVisit(db, USER_A, visit(a.id, "loved"), 1);
    await logVisit(db, USER_B, visit(b.id, "loved"), 1);
    await expect(answerComparison(db, USER_A, { winnerPlaceId: a.id, loserPlaceId: b.id, occasion: "casual" }, null, 2)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a visit to an unknown place", async () => {
    const { db } = await setup();
    await expect(logVisit(db, USER_A, visit("00000000-0000-4000-8000-000000000999", "fine"), 1)).rejects.toMatchObject({ status: 404 });
  });

  it("refits both occasions when a visit moves, and on delete", async () => {
    const { db, places: [a] } = await setup();
    const { visit: v } = await logVisit(db, USER_A, visit(a.id, "fine", "casual"), 1);
    await editVisit(db, USER_A, v.id, { occasion: "special", reaction: "loved" }, 2);
    expect(await listScores(db, USER_A, "casual")).toEqual([]);
    expect((await listScores(db, USER_A, "special"))[0].score).toBe(8.5);
    await removeVisit(db, USER_A, v.id, 3);
    expect(await listScores(db, USER_A)).toEqual([]);
    await expect(removeVisit(db, USER_A, v.id, 4)).rejects.toMatchObject({ status: 404 });
    await expect(editVisit(db, USER_B, v.id, {}, 4)).rejects.toMatchObject({ status: 404 });
  });

  it("saves a rating as the starting score and forgets a skip at that place", async () => {
    const { db, places: [a] } = await setup();
    await addSkip(db, USER_A, a.id, 1);
    const logged = await logVisit(db, USER_A, { ...visit(a.id, "loved", "casual", 9), dated: false }, 2);
    expect(logged.score).toBe(9);
    expect(logged.visit).toMatchObject({ rating: 9, dated: false });
    expect(await recentSkips(db, USER_A, 3)).toEqual(new Set());
  });

  it("refuses a rating outside the reaction's band, on log and on edit", async () => {
    const { db, places: [a] } = await setup();
    await expect(logVisit(db, USER_A, visit(a.id, "fine", "casual", 9), 1)).rejects.toMatchObject({ status: 400 });
    const { visit: v } = await logVisit(db, USER_A, visit(a.id, "loved", "casual", 9), 1);
    await expect(editVisit(db, USER_A, v.id, { reaction: "fine" }, 2)).rejects.toMatchObject({ status: 400 });
    const edited = await editVisit(db, USER_A, v.id, { reaction: "fine", rating: 6 }, 3);
    expect(edited).toMatchObject({ visit: { reaction: "fine", rating: 6 }, score: 6 });
  });

  it("keeps fields a patch leaves out", async () => {
    const { db, places: [a] } = await setup();
    const { visit: v } = await logVisit(db, USER_A, { ...visit(a.id, "loved"), dishes: ["dumplings"], note: "good" }, 1);
    const { visit: after } = await editVisit(db, USER_A, v.id, { rating: 8 }, 2);
    expect(after).toMatchObject({ dishes: ["dumplings"], note: "good", rating: 8 });
  });

  it("returns the answer's id and the subject's score, and undoes it", async () => {
    const { db, places: [a, b] } = await setup();
    await logVisit(db, USER_A, visit(a.id, "loved"), 1);
    await logVisit(db, USER_A, visit(b.id, "loved"), 2);
    const answer = await answerComparison(db, USER_A, { winnerPlaceId: b.id, loserPlaceId: a.id, occasion: "casual" }, { subjectPlaceId: b.id, asked: 2 }, 3);
    expect(answer.id).toBeGreaterThan(0);
    expect(answer.subjectScore).toBeGreaterThan(8.5);
    expect(answer.subjectScore).toBe(answer.score);
    expect(answer.opponent).toBeNull();
    await expect(undoComparison(db, USER_B, answer.id, b.id, 4)).rejects.toMatchObject({ status: 404 });
    expect(await undoComparison(db, USER_A, answer.id, b.id, 4)).toEqual({ score: 8.5 });
    await expect(undoComparison(db, USER_A, answer.id, null, 5)).rejects.toMatchObject({ status: 404 });
  });

  it("step offers the next opponent until asked reaches the limit", async () => {
    const { db, places: [a, b] } = await setup();
    await logVisit(db, USER_A, visit(a.id, "loved"), 1);
    await logVisit(db, USER_A, visit(b.id, "loved"), 2);
    expect((await step(db, USER_A, b.id, "casual", 1)).opponent?.id).toBe(a.id);
    expect(await step(db, USER_A, b.id, "casual", 2)).toMatchObject({ score: 8.5, opponent: null, asked: 2 });
  });
});
