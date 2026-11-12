import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A } from "@/test/db";
import { migrate } from "../db/schema";
import { deleteStaleGuests, getUser, GUEST_TTL_MS, insertGuest, touchGuest } from "../db/users";
import { insertVisit } from "../db/visits";
import { listVisits } from "../db/visits";
import { signIn } from "./accounts";
import { createGuest, upgradeToAccount } from "./guest";

const DAY = 24 * 60 * 60_000;

describe("guests", () => {
  it("are users with no email or password, which the database enforces", async () => {
    const db = await freshDb();
    const id = await createGuest(db, 1000);
    expect(await getUser(db, id)).toMatchObject({ id, email: null, passwordHash: null, isGuest: true, createdAt: 1000, lastSeenAt: 1000 });
    await expect(db.query("UPDATE users SET email = 'x@example.com' WHERE id = $1", [id])).rejects.toThrow();
    await expect(db.query("INSERT INTO users (id, created_at) VALUES ('00000000-0000-4000-8000-0000000000ff', now())")).rejects.toThrow();
    expect(await getUser(db, USER_A)).toMatchObject({ isGuest: false, lastSeenAt: null });
  });

  it("migrate runs twice without error", async () => {
    const db = await freshDb();
    await migrate(db);
    expect((await db.query("SELECT conname FROM pg_constraint WHERE conname = 'users_guest_shape'")).length).toBe(1);
  });

  it("upgrade keeps the id and everything saved, and refuses a taken email", async () => {
    const db = await freshDb();
    const place = await addPlace(db);
    const id = await createGuest(db, 1);
    await insertVisit(db, id, { placeId: place.id, visitedOn: "2026-11-11", reaction: "loved", occasion: "casual", dishes: [], note: null }, 1);
    expect(await upgradeToAccount(db, id, { email: "a@example.com", password: "long-enough" })).toBe("email-taken");
    expect((await getUser(db, id))?.isGuest).toBe(true);
    expect(await upgradeToAccount(db, id, { email: "new@example.com", password: "long-enough" })).toBe("upgraded");
    expect(await getUser(db, id)).toMatchObject({ email: "new@example.com", isGuest: false });
    expect(await listVisits(db, id)).toHaveLength(1);
    expect(await signIn(db, { email: "new@example.com", password: "long-enough" })).toBe(id);
    expect(await upgradeToAccount(db, id, { email: "other@example.com", password: "long-enough" })).toBe("not-guest");
  });

  it("touch updates last seen at most daily, and only for guests", async () => {
    const db = await freshDb();
    const id = await createGuest(db, 0);
    await touchGuest(db, id, DAY / 2);
    expect((await getUser(db, id))?.lastSeenAt).toBe(0);
    await touchGuest(db, id, DAY + 1);
    expect((await getUser(db, id))?.lastSeenAt).toBe(DAY + 1);
    await touchGuest(db, USER_A, DAY * 5);
    expect((await getUser(db, USER_A))?.lastSeenAt).toBeNull();
  });

  it("stale cleanup deletes only guests unseen for 30 days, with their data", async () => {
    const db = await freshDb();
    const place = await addPlace(db);
    const old = "00000000-0000-4000-8000-0000000000d1";
    const fresh = "00000000-0000-4000-8000-0000000000d2";
    await insertGuest(db, old, 0);
    await insertGuest(db, fresh, GUEST_TTL_MS);
    await insertVisit(db, old, { placeId: place.id, visitedOn: "2026-11-11", reaction: "fine", occasion: "casual", dishes: [], note: null }, 0);
    expect(await deleteStaleGuests(db, GUEST_TTL_MS + 1)).toBe(1);
    expect(await getUser(db, old)).toBeNull();
    expect(await getUser(db, fresh)).not.toBeNull();
    expect(await getUser(db, USER_A)).not.toBeNull();
    expect((await db.query("SELECT 1 FROM visits WHERE user_id = $1", [old])).length).toBe(0);
    expect((await db.query("SELECT 1 FROM places WHERE id = $1", [place.id])).length).toBe(1);
  });
});
