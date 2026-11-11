import { describe, expect, it } from "vitest";
import { listResolvedPredictions, latestPrediction } from "../db/predictions";
import { saveScores } from "../db/scores";
import { insertVisit } from "../db/visits";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import { calibrationOffset, feedbackFor, recordShown, syncFeedback, userCalibration } from "./feedback";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-01T18:00:00Z");

describe("calibrationOffset", () => {
  it("is 0 with no feedback and shrinks small samples", () => {
    expect(calibrationOffset([])).toBe(0);
    expect(calibrationOffset([{ rawPredicted: 8, actual: 6 }])).toBe(-0.5);
  });
  it("approaches the mean miss and is clamped", () => {
    const many = Array.from({ length: 30 }, () => ({ rawPredicted: 5, actual: 6 }));
    expect(calibrationOffset(many)).toBeCloseTo(0.9, 1);
    expect(calibrationOffset(Array.from({ length: 30 }, () => ({ rawPredicted: 9, actual: 1 })))).toBe(-2);
  });
  it("holds a steady bias over many rounds instead of decaying back to 0", () => {
    // The user always scores 2 below the raw prediction. Each round shows the
    // calibrated score and logs one visit; the offset must stay near -2.
    const history: { rawPredicted: number; actual: number }[] = [];
    const offsets: number[] = [];
    for (let round = 0; round < 80; round++) {
      const raw = 7 + (round % 3) * 0.5;
      offsets.push(calibrationOffset(history.slice(-50)));
      history.push({ rawPredicted: raw, actual: raw - 2 });
    }
    expect(offsets.slice(30).every((o) => o <= -1.8)).toBe(true);
    expect(offsets.at(-1)).toBeCloseTo(-1.9, 1);
  });
});

describe("predictions round trip", () => {
  it("records shown recs once per window, resolves on a later visit and calibrates", async () => {
    const db = await freshDb();
    const p = await addPlace(db);
    const other = await addPlace(db, { sourceId: "node/2" });

    expect(await recordShown(db, USER_A, [{ placeId: p.id, score: 8.44, raw: 8.44 }, { placeId: other.id, score: 7, raw: 7 }], T0)).toBe(2);
    expect(await recordShown(db, USER_A, [{ placeId: p.id, score: 9, raw: 9 }], T0 + DAY)).toBe(0);
    expect((await latestPrediction(db, USER_A, p.id))?.predicted).toBe(8.4);

    // A visit before the prediction day doesn't count; one after does.
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-10-20", reaction: "loved", occasion: "casual", dishes: [], note: null }, T0);
    expect(await syncFeedback(db, USER_A)).toBe(0);
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-03", reaction: "fine", occasion: "casual", dishes: [], note: null }, T0 + 2 * DAY);
    await saveScores(db, USER_A, "casual", [{ placeId: p.id, score: 7.1 }], T0 + 2 * DAY);
    expect(await syncFeedback(db, USER_A)).toBe(1);
    expect(await syncFeedback(db, USER_A)).toBe(0);

    expect(await feedbackFor(db, USER_A, p.id)).toEqual({ predicted: 8.4, actual: 7.1, at: T0 });
    expect(await feedbackFor(db, USER_A, other.id)).toBeNull();
    expect(await feedbackFor(db, USER_B, p.id)).toBeNull();
    expect(await listResolvedPredictions(db, USER_A)).toHaveLength(1);
    expect(await userCalibration(db, USER_A)).toBe(-0.3);
  });

  it("uses the reaction when the place has no fitted score", async () => {
    const db = await freshDb();
    const p = await addPlace(db);
    await recordShown(db, USER_A, [{ placeId: p.id, score: 6, raw: 6 }], T0);
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "night_out", dishes: [], note: null }, T0);
    await syncFeedback(db, USER_A);
    expect((await feedbackFor(db, USER_A, p.id))?.actual).toBe(8.5);
  });

  it("calibrates on the raw prediction, not the calibrated one shown", async () => {
    const db = await freshDb();
    const places = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => addPlace(db, { sourceId: `node/${i}` })));
    // Shown 6.0 after a -2 offset; the raw model said 8.0. The user gives 6.0
    // (reaction fine, fitted score 6), so the miss is -2, not 0.
    await recordShown(db, USER_A, places.map((p) => ({ placeId: p.id, score: 6, raw: 8 })), T0);
    for (const p of places) {
      await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-02", reaction: "fine", occasion: "casual", dishes: [], note: null }, T0 + DAY);
      await saveScores(db, USER_A, "casual", [{ placeId: p.id, score: 6 }], T0 + DAY);
    }
    expect(await syncFeedback(db, USER_A)).toBe(6);
    expect(await userCalibration(db, USER_A)).toBeCloseTo(-1.3, 1);
    expect(await feedbackFor(db, USER_A, places[0].id)).toMatchObject({ predicted: 6, actual: 6 });
  });

  it("matches a same-night visit logged with the user's local date, a day behind UTC", async () => {
    const db = await freshDb();
    const p = await addPlace(db);
    // 6pm Pacific on Nov 5 is 02:00 UTC on Nov 6; the visit is logged as Nov 5.
    await recordShown(db, USER_A, [{ placeId: p.id, score: 7, raw: 7 }], Date.parse("2026-11-06T02:00:00Z"));
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-05", reaction: "loved", occasion: "casual", dishes: [], note: null }, Date.parse("2026-11-06T05:00:00Z"));
    expect(await syncFeedback(db, USER_A)).toBe(1);
  });

  it("still ignores a visit two days before the prediction", async () => {
    const db = await freshDb();
    const p = await addPlace(db);
    await recordShown(db, USER_A, [{ placeId: p.id, score: 7, raw: 7 }], Date.parse("2026-11-06T02:00:00Z"));
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-04", reaction: "loved", occasion: "casual", dishes: [], note: null }, Date.parse("2026-11-06T05:00:00Z"));
    expect(await syncFeedback(db, USER_A)).toBe(0);
  });
});
