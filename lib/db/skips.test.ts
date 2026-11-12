import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import { addSkip, recentSkips, removeSkip, SKIP_TTL_MS } from "./skips";

describe("place skips", () => {
  it("adds once, keeps the first, expires after 180 days, and removes per user", async () => {
    const db = await freshDb();
    const place = await addPlace(db);
    expect(await addSkip(db, USER_A, place.id, 1000)).toEqual({ placeId: place.id, createdAt: 1000 });
    expect((await addSkip(db, USER_A, place.id, 2000)).createdAt).toBe(1000);
    expect(await recentSkips(db, USER_A, 5000)).toEqual(new Set([place.id]));
    expect(await recentSkips(db, USER_A, 1000 + SKIP_TTL_MS)).toEqual(new Set());
    expect(await recentSkips(db, USER_B, 5000)).toEqual(new Set());
    expect(await removeSkip(db, USER_B, place.id)).toBe(false);
    expect(await removeSkip(db, USER_A, place.id)).toBe(true);
    expect(await recentSkips(db, USER_A, 5000)).toEqual(new Set());
  });
});
