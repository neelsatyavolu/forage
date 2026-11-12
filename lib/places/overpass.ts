import { z } from "zod";
import type { Box } from "../db/places";
import type { PlaceInput } from "../types";
import { PlacesError } from "./errors";
import { USER_AGENT } from "./osm";
import { fromOverpass, overpassBoxQuery } from "./osm-parse";

// Overpass, the free OpenStreetMap query service, through its public mirrors.
// Any one of them is often at capacity, so each gets a timeout and a failure
// moves on to the next, all inside one overall budget. A mirror that fails is
// skipped for BREAK_MS in this process (a circuit breaker).

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

/** How long a failed mirror is skipped. */
export const BREAK_MS = 2 * 60_000;
/** Below this much budget left, another mirror isn't worth starting. */
const MIN_TRY_MS = 500;
/** Elements per answer. An answer this long may have been cut short. */
export const OVERPASS_LIMIT = 3_000;

/** Overpass answers 200 with a `remark` when the query ran out of time or memory; the elements are then partial. */
const Answer = z.object({ elements: z.array(z.unknown()), remark: z.string().optional() });
const FAILED_REMARK = /runtime error|timed out|out of memory/i;

export type OverpassResult = { rows: PlaceInput[]; mirror: string; truncated: boolean };

export type OverpassOptions = {
  /** Total time across mirrors. */
  budgetMs: number;
  /** Most time one mirror gets. */
  perMirrorMs: number;
  /** Most mirrors tried (skipped ones don't count). */
  maxMirrors?: number;
  /**
   * Whether running out of time trips the breaker. A short request-path
   * timeout says little about a mirror that answers slow but well.
   */
  breakOnTimeout?: boolean;
  fetcher?: typeof fetch;
  clock?: () => number;
};

/** Mirror URL -> the time until which it is skipped. */
const broken = new Map<string, number>();

/** Test hook: forget failed mirrors. */
export function resetOverpassBreaker(): void {
  broken.clear();
}

type Attempt = { ok: true; rows: PlaceInput[]; elements: number } | { ok: false; timedOut: boolean };

async function tryMirror(url: string, body: string, timeoutMs: number, fetcher: typeof fetch): Promise<Attempt> {
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, timedOut: false };
    const parsed = Answer.safeParse(await res.json());
    if (!parsed.success || FAILED_REMARK.test(parsed.data.remark ?? "")) return { ok: false, timedOut: false };
    const { elements } = parsed.data;
    return { ok: true, rows: elements.map(fromOverpass).filter((p): p is PlaceInput => p !== null), elements: elements.length };
  } catch (err) {
    return { ok: false, timedOut: err instanceof Error && err.name === "TimeoutError" };
  }
}

/** Named places to eat or drink inside a box, from the first mirror that answers in time. */
export async function overpassBox(box: Box, opts: OverpassOptions): Promise<OverpassResult> {
  const { fetcher = fetch, clock = Date.now, maxMirrors = OVERPASS_MIRRORS.length } = opts;
  const deadline = clock() + opts.budgetMs;
  const body = new URLSearchParams({ data: overpassBoxQuery(box, OVERPASS_LIMIT, Math.max(1, Math.ceil(opts.perMirrorMs / 1000))) }).toString();
  let tried = 0;
  for (const mirror of OVERPASS_MIRRORS) {
    if (tried >= maxMirrors) break;
    if ((broken.get(mirror) ?? 0) > clock()) continue;
    const left = deadline - clock();
    if (left < MIN_TRY_MS) break;
    tried++;
    const answer = await tryMirror(mirror, body, Math.min(opts.perMirrorMs, left), fetcher);
    if (answer.ok) {
      broken.delete(mirror);
      return { rows: answer.rows, mirror: new URL(mirror).host, truncated: answer.elements >= OVERPASS_LIMIT };
    }
    if (!answer.timedOut || opts.breakOnTimeout) broken.set(mirror, clock() + BREAK_MS);
  }
  throw new PlacesError("The map data service isn't answering. Try again in a moment.", 503);
}
