import type { Queryable } from "../db/client";
import { claimTiles, markTiles } from "../db/osm-tiles";
import type { Box } from "../db/places";
import type { OverpassResult } from "./overpass";
import { saveFetched } from "./store";
import { tilesBox } from "./tiles";

// Fetches missing or stale tiles after the response has gone out, with a
// longer budget than a request can afford. Concurrent refills of a tile are
// dropped: within this process by an in-memory set, across instances by a
// claim in osm_tiles that lasts CLAIM_TTL_MS. If the whole box comes back cut
// short (a dense area), each tile is fetched on its own so each can be marked.

export const REFILL_BUDGET_MS = 25_000;
export const CLAIM_TTL_MS = 60_000;
/** Below this much budget left, another per-tile request isn't started. */
const MIN_TILE_MS = 1_000;

export type RefillDeps = {
  db: Queryable;
  /** Overpass within the time given. */
  overpass: (box: Box, budgetMs: number) => Promise<OverpassResult>;
  clock: () => number;
  /** Tiles fetched at or before this are stale. */
  staleBefore: number;
};

export type RefillResult = { claimed: string[]; marked: string[] };

const inFlight = new Set<string>();

/** Test hook: forget refills this process thinks are running. */
export function resetRefills(): void {
  inFlight.clear();
}

async function fetchAndMark(deps: RefillDeps, tiles: readonly string[], budgetMs: number): Promise<{ marked: string[]; truncated: boolean }> {
  const answer = await deps.overpass(tilesBox(tiles), budgetMs);
  await saveFetched(deps.db, answer.rows, deps.clock());
  if (answer.truncated) return { marked: [], truncated: true };
  await markTiles(deps.db, tiles, deps.clock());
  return { marked: [...tiles], truncated: false };
}

async function perTile(deps: RefillDeps, tiles: readonly string[], deadline: number): Promise<string[]> {
  const marked: string[] = [];
  for (const tile of tiles) {
    const left = deadline - deps.clock();
    if (left < MIN_TILE_MS) break;
    try {
      marked.push(...(await fetchAndMark(deps, [tile], left)).marked);
    } catch (err) {
      console.error("[places] tile refill failed:", tile, err instanceof Error ? err.message : err);
    }
  }
  return marked;
}

/** Refills the tiles nobody else is refilling. Never throws; failures are logged and retried by a later search. */
export async function refillTiles(deps: RefillDeps, tiles: readonly string[], opts: { perTile?: boolean } = {}): Promise<RefillResult> {
  const free = [...new Set(tiles)].filter((t) => !inFlight.has(t));
  if (free.length === 0) return { claimed: [], marked: [] };
  free.forEach((t) => inFlight.add(t));
  let claimed: string[] = [];
  try {
    const start = deps.clock();
    const deadline = start + REFILL_BUDGET_MS;
    claimed = await claimTiles(deps.db, free, start, CLAIM_TTL_MS, deps.staleBefore);
    if (claimed.length === 0) return { claimed, marked: [] };
    if (opts.perTile || claimed.length === 1) return { claimed, marked: await perTile(deps, claimed, deadline) };
    const whole = await fetchAndMark(deps, claimed, REFILL_BUDGET_MS);
    return { claimed, marked: whole.truncated ? await perTile(deps, claimed, deadline) : whole.marked };
  } catch (err) {
    console.error("[places] background refill failed:", err instanceof Error ? err.message : err);
    return { claimed, marked: [] };
  } finally {
    free.forEach((t) => inFlight.delete(t));
  }
}
