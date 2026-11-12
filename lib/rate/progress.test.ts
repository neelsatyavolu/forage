import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "@/test/db";
import { addWant } from "../db/want";
import { addSkip, SKIP_TTL_MS } from "../db/skips";
import { insertGuest } from "../db/users";
import { insertVisit } from "../db/visits";
import { crowdCounts, deckExclusions } from "./deck-store";
import { GUEST_RATED_CAP, guestAtCap, progressFor } from "./progress";

const GUEST = "00000000-0000-4000-8000-0000000000c1";
const v = (placeId: string, occasion: "casual" | "quick" = "casual") => ({ placeId, visitedOn: "2026-11-11", reaction: "loved" as const, occasion, dishes: [], note: null });

describe("progress", () => {
  it("counts distinct places across occasions, and 0 with no user", async () => {
    const db = await freshDb();
    const [a, b] = await Promise.all([addPlace(db, { sourceId: "node/a" }), addPlace(db, { sourceId: "node/b" })]);
    await insertVisit(db, USER_A, v(a.id), 1);
    await insertVisit(db, USER_A, v(a.id, "quick"), 2);
    await insertVisit(db, USER_A, v(b.id), 3);
    expect(await progressFor(db, USER_A)).toEqual({ rated: 2, firstPicksAt: 5, goal: 10 });
    expect(await progressFor(db, null)).toEqual({ rated: 0, firstPicksAt: 5, goal: 10 });
  });

  it("caps guests at GUEST_RATED_CAP new places, never full accounts", async () => {
    const db = await freshDb();
    await insertGuest(db, GUEST, 1);
    const place = await addPlace(db);
    expect(await guestAtCap(db, GUEST, place.id)).toBe(false);
    // Fill the guest up to the cap.
    const many = await Promise.all(Array.from({ length: GUEST_RATED_CAP }, (_, i) => addPlace(db, { sourceId: `node/m${i}` })));
    for (const p of many) await insertVisit(db, GUEST, v(p.id), 1);
    expect(await guestAtCap(db, GUEST, place.id)).toBe(true);
    expect(await guestAtCap(db, GUEST, many[0].id)).toBe(false);
    for (const p of many) await insertVisit(db, USER_A, v(p.id), 1);
    expect(await guestAtCap(db, USER_A, place.id)).toBe(false);
  });
});

describe("deck store", () => {
  it("leaves out the user's rated, wanted and recently skipped places", async () => {
    const db = await freshDb();
    const [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map((n) => addPlace(db, { sourceId: `node/${n}` })));
    await insertVisit(db, USER_A, v(a.id), 1);
    await addWant(db, USER_A, b.id, "rate", 1);
    await addSkip(db, USER_A, c.id, 1000);
    await addSkip(db, USER_A, d.id, 1000 - SKIP_TTL_MS);
    expect(await deckExclusions(db, USER_A, 2000)).toEqual(new Set([a.id, b.id, c.id]));
    expect(await deckExclusions(db, USER_B, 2000)).toEqual(new Set());
    expect(await deckExclusions(db, null, 2000)).toEqual(new Set());
  });

  it("counts distinct users per place, only at or above the minimum", async () => {
    const db = await freshDb();
    await insertGuest(db, GUEST, 1);
    const [a, b] = await Promise.all([addPlace(db, { sourceId: "node/a" }), addPlace(db, { sourceId: "node/b" })]);
    for (const user of [USER_A, USER_B, GUEST]) await insertVisit(db, user, v(a.id), 1);
    await insertVisit(db, USER_A, v(a.id, "quick"), 1);
    await insertVisit(db, USER_A, v(b.id), 1);
    expect(await crowdCounts(db, [a.id, b.id], 3)).toEqual(new Map([[a.id, 3]]));
    expect(await crowdCounts(db, [], 3)).toEqual(new Map());
  });
});
