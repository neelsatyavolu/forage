import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { accountIn } from "../account/accounts";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS, sessionKey } from "../account/session";
import { HttpError, clientIp } from "../api";
import { getDb } from "../db/client";
import { sessionVersionOf } from "../db/users";
import { env } from "./env";

let key: Buffer | null = null;
export const signingKey = (): Buffer => (key ??= sessionKey(env().FORAGE_SECRET));

/** The signed-in account's id, or null. A request with no cookie costs no database read. */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? accountIn(await getDb(), signingKey(), token, Date.now()) : null;
}

/** The signed-in account's id. Throws a 401 HttpError (which handle() answers) when signed out. */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new HttpError("Sign in first.", 401);
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
