import { randomUUID } from "node:crypto";
import type { Db, Queryable } from "../db/client";
import { deleteStaleGuests, insertGuest, upgradeGuest } from "../db/users";
import { hashPassword } from "./password";

// Guests: a visitor's first write in the rating flow makes a real user with
// no email or password, so nothing they rate is lost. Signing up later fills
// in the same row; signing in to another account merges it (./merge).

/** A new guest's id. */
export async function createGuest(q: Queryable, now: number): Promise<string> {
  const id = randomUUID();
  await insertGuest(q, id, now);
  return id;
}

export type UpgradeResult = "upgraded" | "email-taken" | "not-guest";

/** Makes the guest a full account with this email and password, keeping its id and everything saved under it. */
export async function upgradeToAccount(db: Db, guestId: string, input: { email: string; password: string }): Promise<UpgradeResult> {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const done = await upgradeGuest(tx, guestId, input.email, passwordHash);
    if (done === null) return "email-taken";
    return done ? "upgraded" : "not-guest";
  });
}

/** Removes guests nobody has used for 30 days. Never throws: it runs after the response. */
export async function sweepGuests(q: Queryable, now: number): Promise<void> {
  try {
    await deleteStaleGuests(q, now);
  } catch (err) {
    console.error("[forage] stale guest cleanup failed:", err instanceof Error ? err.message : err);
  }
}
