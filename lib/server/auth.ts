import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { accountIn } from "../account/accounts";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS, sessionKey } from "../account/session";
import { HttpError, clientIp } from "../api";
import { getDb } from "../db/client";
import { isGuest, sessionVersionOf, touchGuest } from "../db/users";
import { env } from "./env";

let key: Buffer | null = null;
export const signingKey = (): Buffer => (key ??= sessionKey(env().FORAGE_SECRET));

/** The signed-in account's id, or null. A request with no cookie costs no database read. */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? accountIn(await getDb(), signingKey(), token, Date.now()) : null;
}

/** A guest whose session has less than this left gets a fresh 30-day cookie, so an active guest never expires before cleanup. */
const GUEST_RENEW_BELOW_MS = 23 * 24 * 60 * 60 * 1000;

/** Milliseconds left on a token already checked by accountIn. */
const msLeft = (token: string, now: number) => Number(token.split(".")[1]) - now;

/**
 * The signed-in user's id (a guest counts). Throws a 401 HttpError (which
 * handle() answers) when there is none. Marks a guest as seen, at most once a
 * day, and renews a guest's cookie once it has less than 23 days left.
 */
export async function requireUserId(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const now = Date.now();
  const userId = token ? await accountIn(db, signingKey(), token, now) : null;
  if (!userId || !token) throw new HttpError("Sign in first.", 401);
  await touchGuest(db, userId, now);
  if (msLeft(token, now) < GUEST_RENEW_BELOW_MS && (await isGuest(db, userId))) await startSession(userId);
  return userId;
}

/** Signs this browser in at the account's current session version. */
export async function startSession(userId: string): Promise<void> {
  const version = await sessionVersionOf(await getDb(), userId);
  if (version === null) throw new Error("Cannot sign in to an account that does not exist");
  (await cookies()).set(SESSION_COOKIE, createSession(signingKey(), userId, Date.now(), version), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
}

/** Rate limits key on a keyed hash of the address, never the address itself. */
export function ipKey(req: Request): string {
  const ip = clientIp(req);
  return createHmac("sha256", signingKey()).update(`ip:${ip}`).digest("base64url").slice(0, 32);
}
