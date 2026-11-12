import type { Queryable } from "../../lib/db/client";
import type { PlaceInput } from "../../lib/types";
import { placeFromLine } from "./feature";
import { BATCH, saveBatch, tileOf, type SaveCounts } from "./store";

// Streams one state's geojsonseq into the database in batches.

export type StateCounts = SaveCounts & {
  /** geojsonseq lines read. */
  features: number;
  /** Lines that were named places to eat or drink. */
  places: number;
  /** Places already seen earlier in the run (a way exported twice, or a place in two states' extracts). */
  repeats: number;
  /** Tiles that received at least one place. */
  tiles: Set<string>;
};

export type ImportContext = {
  q: Queryable;
  now: number;
  /** Source ids seen so far in this run, across states. Added to. */
  seen: Set<string>;
  /** Called between batches; throws to stop (the size guard). */
  check?: () => Promise<void>;
  /** Batches between checks. */
  checkEvery?: number;
};

export async function importLines(ctx: ImportContext, lines: AsyncIterable<string>): Promise<StateCounts> {
  const counts: StateCounts = { features: 0, places: 0, repeats: 0, inserted: 0, updated: 0, unchanged: 0, tiles: new Set() };
  let batch: PlaceInput[] = [];
  let batches = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const saved = await saveBatch(ctx.q, batch, ctx.now);
    counts.inserted += saved.inserted;
    counts.updated += saved.updated;
    counts.unchanged += saved.unchanged;
    batch = [];
    batches++;
    if (ctx.check && batches % (ctx.checkEvery ?? 20) === 0) await ctx.check();
  };
  for await (const line of lines) {
    counts.features++;
    const place = placeFromLine(line);
    if (!place) continue;
    if (ctx.seen.has(place.sourceId)) {
      counts.repeats++;
      continue;
    }
    ctx.seen.add(place.sourceId);
    counts.places++;
    counts.tiles.add(tileOf(place));
    batch.push(place);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return counts;
}
