import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

/** A guest has no email or password yet; a full account always has both (users_guest_shape). */
export type User = { id: string; email: string | null; passwordHash: string | null; isGuest: boolean; createdAt: number; lastSeenAt: number | null };
export type NewAccount = { id: string; email: string; passwordHash: string; createdAt: number };

const rowToUser = (row: Row): User => ({
  id: row.id as string,
  email: (row.email as string | null) ?? null,
  passwordHash: (row.password_hash as string | null) ?? null,
  isGuest: Boolean(row.is_guest),
  createdAt: fromTs(row.created_at),
  lastSeenAt: row.last_seen_at === null || row.last_seen_at === undefined ? null : fromTs(row.last_seen_at),
});

/** False when the email already belongs to an account. */
export async function insertUser(q: Queryable, user: NewAccount): Promise<boolean> {
  const rows = await q.query(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING id",
    [user.id, user.email, user.passwordHash, toTs(user.createdAt)],
  );
  return rows.length === 1;
}

export async function findUserByEmail(q: Queryable, email: string): Promise<User | null> {
  const [row] = await q.query("SELECT * FROM users WHERE email = $1", [email]);
  return row ? rowToUser(row) : null;
}

export async function getUser(q: Queryable, id: string): Promise<User | null> {
  const [row] = await q.query("SELECT * FROM users WHERE id = $1", [id]);
  return row ? rowToUser(row) : null;
}

/** The version a session must carry to still count, or null when there is no such account. */
export async function sessionVersionOf(q: Queryable, id: string): Promise<number | null> {
  const [row] = await q.query<{ session_version: number }>("SELECT session_version FROM users WHERE id = $1", [id]);
  return row?.session_version ?? null;
}

/** Stores a new password and ends every session made under the old one. */
export async function replacePassword(q: Queryable, id: string, passwordHash: string): Promise<void> {
  await q.query("UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1", [id, passwordHash]);
}

/** Ends every session the account has, everywhere. */
export async function endSessions(q: Queryable, id: string): Promise<void> {
  await q.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [id]);
}

/** Deletes the account; its resets and preferences go with it (ON DELETE CASCADE). */
export async function deleteUser(q: Queryable, id: string): Promise<void> {
  await q.query("DELETE FROM users WHERE id = $1", [id]);
}

/** A guest: a user with no email or password, seen now. */
export async function insertGuest(q: Queryable, id: string, now: number): Promise<void> {
  await q.query("INSERT INTO users (id, is_guest, created_at, last_seen_at) VALUES ($1, true, $2, $2)", [id, toTs(now)]);
}

/**
 * Turns a guest into a full account on the same row, so everything it saved
 * stays, and ends the guest's sessions. Null when the email is taken; false
 * when the user isn't a guest (any more).
 */
export async function upgradeGuest(q: Queryable, id: string, email: string, passwordHash: string): Promise<boolean | null> {
  const [taken] = await q.query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (taken) return null;
  const rows = await q.query(
    `UPDATE users SET email = $2, password_hash = $3, is_guest = false, session_version = session_version + 1
     WHERE id = $1 AND is_guest AND NOT EXISTS (SELECT 1 FROM users WHERE email = $2) RETURNING id`,
    [id, email, passwordHash],
  );
  return rows.length === 1;
}

const DAY_MS = 24 * 60 * 60_000;

/** Marks a guest as seen, at most once a day. Full accounts are left alone. */
export async function touchGuest(q: Queryable, id: string, now: number): Promise<void> {
  await q.query(
    "UPDATE users SET last_seen_at = $2 WHERE id = $1 AND is_guest AND (last_seen_at IS NULL OR last_seen_at < $3)",
    [id, toTs(now), toTs(now - DAY_MS)],
  );
}

/** A guest unseen this long is deleted with everything it saved. */
export const GUEST_TTL_MS = 30 * DAY_MS;
const STALE_BATCH = 200;

/** Deletes up to 200 guests unseen for GUEST_TTL_MS. Their visits, lists and scores go with them; places stay. */
export async function deleteStaleGuests(q: Queryable, now: number): Promise<number> {
  const rows = await q.query(
    `DELETE FROM users WHERE id IN (
       SELECT id FROM users WHERE is_guest AND COALESCE(last_seen_at, created_at) < $1 LIMIT ${STALE_BATCH}
     ) RETURNING id`,
    [toTs(now - GUEST_TTL_MS)],
  );
  return rows.length;
}

export async function isGuest(q: Queryable, id: string): Promise<boolean> {
  const [row] = await q.query<{ is_guest: boolean }>("SELECT is_guest FROM users WHERE id = $1", [id]);
  return Boolean(row?.is_guest);
}
