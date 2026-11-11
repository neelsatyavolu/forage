import { z } from "zod";
import type { Box } from "../db/places";
import type { PlaceInput } from "../types";
import { PlacesError } from "./errors";
import { USER_AGENT } from "./osm";
import { fromOverpass, overpassBoxQuery } from "./osm-parse";

// Overpass, the free OpenStreetMap query service, through its public mirrors.
// Any one of them is often at capacity, so each gets a short timeout and a
// failure moves on to the next, all inside one overall budget.

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

const PER_MIRROR_MS = 3_000;
const BUDGET_MS = 8_000;
/** Below this much budget left, another mirror isn't worth starting. */
const MIN_TRY_MS = 500;
/** Elements per answer. An answer this long may have been cut short. */
export const OVERPASS_LIMIT = 3_000;

/** Overpass answers 200 with a `remark` when the query ran out of time or memory; the elements are then partial. */
const Answer = z.object({ elements: z.array(z.unknown()), remark: z.string().optional() });
const FAILED_REMARK = /runtime error|timed out|out of memory/i;

export type OverpassResult = { rows: PlaceInput[]; mirror: string; truncated: boolean };

async function tryMirror(url: string, body: string, timeoutMs: number, fetcher: typeof fetch): Promise<{ rows: PlaceInput[]; elements: number } | null> {
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const parsed = Answer.safeParse(await res.json());
    if (!parsed.success || FAILED_REMARK.test(parsed.data.remark ?? "")) return null;
    const { elements } = parsed.data;
    return { rows: elements.map(fromOverpass).filter((p): p is PlaceInput => p !== null), elements: elements.length };
  } catch {
    return null;
  }
}

/** Named places to eat or drink inside a box, from the first mirror that answers in time. */
export async function overpassBox(box: Box, fetcher: typeof fetch = fetch, clock: () => number = Date.now): Promise<OverpassResult> {
  const deadline = clock() + BUDGET_MS;
  const body = new URLSearchParams({ data: overpassBoxQuery(box, OVERPASS_LIMIT, Math.ceil(BUDGET_MS / 1000)) }).toString();
  for (const mirror of OVERPASS_MIRRORS) {
    const left = deadline - clock();
    if (left < MIN_TRY_MS) break;
    const answer = await tryMirror(mirror, body, Math.min(PER_MIRROR_MS, left), fetcher);
    if (answer) return { rows: answer.rows, mirror: new URL(mirror).host, truncated: answer.elements >= OVERPASS_LIMIT };
  }
  throw new PlacesError("The map data service isn't answering. Try again in a moment.", 503);
}
