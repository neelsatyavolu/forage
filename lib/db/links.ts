import type { LodestarLink } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

// The account's Lodestar link. sealed_tokens is already encrypted (lib/ai/seal,
// bound to the user) by the caller; this table never holds a usable token.

const rowToLink = (r: Row): LodestarLink => ({
  userId: r.user_id as string,
  sealedTokens: r.sealed_tokens as string,
  lodestarUserLabel: (r.lodestar_user_label as string | null) ?? null,
  createdAt: fromTs(r.created_at),
});

export async function getLodestarLink(q: Queryable, userId: string): Promise<LodestarLink | null> {
  const [row] = await q.query("SELECT * FROM lodestar_links WHERE user_id = $1", [userId]);
  return row ? rowToLink(row) : null;
}

/** Creates the link or replaces its tokens (a refresh); the original created_at stays. */
export async function saveLodestarLink(q: Queryable, userId: string, sealedTokens: string, label: string | null, now: number): Promise<void> {
  await q.query(
    `INSERT INTO lodestar_links (user_id, sealed_tokens, lodestar_user_label, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET sealed_tokens = EXCLUDED.sealed_tokens,
       lodestar_user_label = COALESCE(EXCLUDED.lodestar_user_label, lodestar_links.lodestar_user_label)`,
    [userId, sealedTokens, label, toTs(now)],
  );
}

export async function deleteLodestarLink(q: Queryable, userId: string): Promise<boolean> {
  return (await q.query("DELETE FROM lodestar_links WHERE user_id = $1 RETURNING user_id", [userId])).length === 1;
}

/** The link's sealed tokens, row-locked until the transaction `q` ends, so two refreshes can't both spend one refresh token. */
export async function lockLodestarLink(q: Queryable, userId: string): Promise<string | null> {
  const [row] = await q.query("SELECT sealed_tokens FROM lodestar_links WHERE user_id = $1 FOR UPDATE", [userId]);
  return row ? (row.sealed_tokens as string) : null;
}
