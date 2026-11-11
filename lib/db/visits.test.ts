import { beforeEach, describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "../../test/db";
import type { Place, VisitInput } from "../types";
import type { Db } from "./client";
import { deleteVisit, getVisit, insertVisit, listVisits, updateVisit } from "./visits";

let db: Db;
let place: Place;
const input = (overrides: Partial<VisitInput> = {}): VisitInput => ({
  placeId: place.id, visitedOn: "2026-11-01", reaction: "loved", occasion: "casual", dishes: ["dumplings"], note: null, ...overrides,
});

beforeEach(async () => {
  db = await freshDb();
  place = await addPlace(db);
});

describe("visits", () => {
  it("logs and reads back a visit, only for its owner", async () => {
    const visit = await insertVisit(db, USER_A, input(), 5);
    expect(visit).toMatchObject({ ...input(), userId: USER_A, createdAt: 5 });
    expect(await getVisit(db, USER_A, visit.id)).toEqual(visit);
    expect(await getVisit(db, USER_B, visit.id)).toBeNull();
  });

  it("lists newest first with filters", async () => {
    await insertVisit(db, USER_A, input({ visitedOn: "2026-10-01" }), 1);
    await insertVisit(db, USER_A, input({ visitedOn: "2026-11-02", occasion: "quick" }), 2);
    await insertVisit(db, USER_B, input(), 3);
    expect((await listVisits(db, USER_A)).map((v) => v.visitedOn)).toEqual(["2026-11-02", "2026-10-01"]);
    expect((await listVisits(db, USER_A, { occasion: "quick" })).map((v) => v.visitedOn)).toEqual(["2026-11-02"]);
    expect(await listVisits(db, USER_A, { placeId: place.id, limit: 1 })).toHaveLength(1);
  });

  it("updates only given fields, and only the owner's visit", async () => {
    const visit = await insertVisit(db, USER_A, input(), 1);
    expect(await updateVisit(db, USER_B, visit.id, { reaction: "disliked" })).toBeNull();
    const updated = await updateVisit(db, USER_A, visit.id, { reaction: "fine", note: "salty" });
    expect(updated).toEqual({ ...visit, reaction: "fine", note: "salty" });
  });

  it("deletes only the owner's visit", async () => {
    const visit = await insertVisit(db, USER_A, input(), 1);
    expect(await deleteVisit(db, USER_B, visit.id)).toBe(false);
    expect(await deleteVisit(db, USER_A, visit.id)).toBe(true);
    expect(await listVisits(db, USER_A)).toEqual([]);
  });
});
