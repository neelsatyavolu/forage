import "server-only";
import { getDb } from "../db/client";
import { hitRateLimit } from "../db/rate-limit";

const MINUTE = 60_000;

/** Named limits: [hits allowed, window]. */
export const LIMITS = {
  login: [10, 15 * MINUTE],
  register: [5, 60 * MINUTE],
  forgot: [5, 15 * MINUTE],
  forgotEmail: [3, 60 * MINUTE],
  // Resend's free plan sends 100 a day, shared with other apps.
  forgotSentDaily: [40, 24 * 60 * MINUTE],
  reset: [10, 15 * MINUTE],
  // Logging visits, comparisons, lists and profile edits.
  writes: [300, 15 * MINUTE],
  // Each AI call spends the user's own subscription; keep runaway loops short.
  ai: [40, 15 * MINUTE],
  // Search-as-you-type and nearby lookups; OSM asks for light use and Google bills per call.
  places: [300, 15 * MINUTE],
  placesDaily: [3000, 24 * 60 * MINUTE],
  recs: [120, 15 * MINUTE],
  lodestar: [60, 15 * MINUTE],
  // Guests made per IP. Above register because shared networks and cellular phones share IPs.
  guest: [10, 60 * MINUTE],
  // Rating deck loads with no session yet, per IP.
  deckAnon: [60, 15 * MINUTE],
} as const;

export type LimitName = keyof typeof LIMITS;

/** False once `key` has used up the named limit. */
export async function allow(name: LimitName, key: string): Promise<boolean> {
  const [limit, windowMs] = LIMITS[name];
  return hitRateLimit(await getDb(), `${name}:${key}`, limit, windowMs, Date.now());
}
