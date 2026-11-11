import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { seal, unseal } from "../ai/seal";

// The authorization request in flight: a PKCE verifier (RFC 7636, S256) and a
// state value, kept in a short-lived cookie between "Connect Lodestar" and
// the callback. The cookie is sealed (AES-GCM) and bound to the Forage
// account that started it, so a callback can't be finished by anyone else.

export const FLOW_COOKIE = "fg_lodestar_flow";
export const FLOW_TTL_MS = 10 * 60 * 1000;

export type Flow = { state: string; verifier: string; expiresAt: number };

const FlowSchema = z.object({ state: z.string().min(16).max(200), verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), expiresAt: z.number() });

const aad = (userId: string) => `lodestar-flow:${userId}`;

export const challengeOf = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

/** A fresh verifier and state, good for FLOW_TTL_MS. */
export function newFlow(now: number): Flow {
  return { state: randomBytes(24).toString("base64url"), verifier: randomBytes(48).toString("base64url"), expiresAt: now + FLOW_TTL_MS };
}

export const sealFlow = (key: Buffer, userId: string, flow: Flow): string => seal(key, JSON.stringify(flow), aad(userId));

/** The flow this cookie holds when it belongs to this account, is unexpired and its state matches; otherwise null. */
export function openFlow(key: Buffer, userId: string, sealed: string | undefined, state: string | null, now: number): Flow | null {
  if (!sealed || !state) return null;
  const plain = unseal(key, sealed, aad(userId));
  if (!plain) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    return null;
  }
  const flow = FlowSchema.safeParse(parsed);
  if (!flow.success || flow.data.expiresAt <= now) return null;
  const a = Buffer.from(flow.data.state);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b) ? flow.data : null;
}
