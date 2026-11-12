import type { Db, Queryable } from "../db/client";
import { saveAiConnection } from "../db/ai-connections";
import { deleteUser, isGuest } from "../db/users";
import { refitOccasion } from "../scoring/refit";
import type { Occasion } from "../types";

// Signing in from a guest session moves what the guest saved into the
// account, in one transaction, then deletes the guest. Scores and the taste
// profile are derived data: the guest's are dropped and the account's
// occasions are refitted from the merged visits and comparisons.

/** Seals a guest's AI connection again for the account; null drops it. */
export type Reseal = (provider: string, sealed: string, fromUserId: string, toUserId: string) => string | null;

export type MergeResult = { visits: number };

async function moveKeyed(tx: Queryable, table: "want_list" | "place_skips", cols: string, guestId: string, accountId: string): Promise<void> {
  await tx.query(`INSERT INTO ${table} (user_id, ${cols}) SELECT $2, ${cols} FROM ${table} WHERE user_id = $1 ON CONFLICT DO NOTHING`, [guestId, accountId]);
  await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [guestId]);
}

async function moveAi(tx: Queryable, guestId: string, accountId: string, reseal: Reseal, now: number): Promise<void> {
  const rows = await tx.query<{ provider: string; sealed: string }>(
    `SELECT provider, sealed FROM ai_connections g WHERE user_id = $1
     AND NOT EXISTS (SELECT 1 FROM ai_connections a WHERE a.user_id = $2 AND a.provider = g.provider)`,
    [guestId, accountId],
  );
  for (const row of rows) {
    const sealed = reseal(row.provider, row.sealed, guestId, accountId);
    if (sealed) await saveAiConnection(tx, accountId, row.provider, sealed, now);
  }
}

/** Moves a guest's data into the account and deletes the guest. Null when `guestId` isn't a guest or is the account itself. */
export async function mergeGuest(db: Db, guestId: string, accountId: string, reseal: Reseal, now: number): Promise<MergeResult | null> {
  if (guestId === accountId) return null;
  return db.transaction(async (tx) => {
    if (!(await isGuest(tx, guestId)) || (await isGuest(tx, accountId))) return null;
    const moved = await tx.query<{ occasion: Occasion }>("UPDATE visits SET user_id = $2 WHERE user_id = $1 RETURNING occasion", [guestId, accountId]);
    await tx.query("UPDATE comparisons SET user_id = $2 WHERE user_id = $1", [guestId, accountId]);
    await tx.query("UPDATE predictions SET user_id = $2 WHERE user_id = $1", [guestId, accountId]);
    await moveKeyed(tx, "want_list", "place_id, added_at, source", guestId, accountId);
    await moveKeyed(tx, "place_skips", "place_id, created_at", guestId, accountId);
    await moveAi(tx, guestId, accountId, reseal, now);
    // Taste profile, seeds, scores and anything else left go with the guest (ON DELETE CASCADE).
    await deleteUser(tx, guestId);
    for (const occasion of new Set(moved.map((r) => r.occasion))) await refitOccasion(tx, accountId, occasion, now);
    return { visits: moved.length };
  });
}
