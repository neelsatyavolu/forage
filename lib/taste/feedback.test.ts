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
    expect(calibrationOffset([{ predicted: 8, actual: 6 }])).toBe(-0.5);
  });
  it("approaches the mean miss and is clamped", () => {
    const many = Array.from({ length: 30 }, () => ({ predicted: 5, actual: 6 }));
    expect(calibrationOffset(many)).toBeCloseTo(0.9, 1);
    expect(calibrationOffset(Array.from({ length: 30 }, () => ({ predicted: 9, actual: 1 })))).toBe(-2);
  });
});

describe("predictions round trip", () => {
  it("records shown recs once per window, resolves on a later visit and calibrates", async () => {
    const db = await freshDb();
    const p = await addPlace(db);
    const other = await addPlace(db, { sourceId: "node/2" });

    expect(await recordShown(db, USER_A, [{ placeId: p.id, score: 8.44 }, { placeId: other.id, score: 7 }], T0)).toBe(2);
    expect(await recordShown(db, USER_A, [{ placeId: p.id, score: 9 }], T0 + DAY)).toBe(0);
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
    await recordShown(db, USER_A, [{ placeId: p.id, score: 6 }], T0);
    await insertVisit(db, USER_A, { placeId: p.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "night_out", dishes: [], note: null }, T0);
    await syncFeedback(db, USER_A);
    expect((await feedbackFor(db, USER_A, p.id))?.actual).toBe(8.5);
  });
});
