import { execFile, spawn } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { FOOD_AMENITIES } from "../../lib/places/osm-parse";
import { dbSize, MB, openDb, placesSize, type ImportDb } from "./db";
import { importLines } from "./run";
import { GEOFABRIK_US, parseStates } from "./states";
import { markImported, pruneMissing } from "./store";

// Monthly import of OpenStreetMap places to eat or drink for the US, so
// nearby search is served from the database instead of the public Overpass
// servers. For each Geofabrik state extract: download, keep only food
// places (osmium tags-filter), export as geojsonseq, upsert, mark tiles.
// After a full run, OSM places that weren't seen anywhere are pruned unless a
// user refers to them. Run from the repo root:
//
//   DATABASE_URL=... pnpm dlx tsx@4.19.2 scripts/osm-import/import.ts [--states rhode-island,delaware] [--prune|--no-prune]
//
// Needs osmium-tool and curl on PATH.

const run = promisify(execFile);
const DEFAULT_LIMIT_MB = 400;
/** The same places Overpass is asked for (lib/places/osm-parse overpassBoxQuery). */
const FILTERS = [`nwr/amenity=${FOOD_AMENITIES.join(",")}`, "nwr/shop=bakery"];

const mb = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const log = (...args: unknown[]) => console.log("[osm-import]", ...args);

async function download(state: string, dir: string): Promise<string> {
  const file = join(dir, `${state}.osm.pbf`);
  await run("curl", ["-fsSL", "--retry", "5", "--retry-delay", "10", "--retry-all-errors", "-A", "Forage-osm-import/1.0 (+https://forage.xanom.co)", "-o", file, `${GEOFABRIK_US}/${state}-latest.osm.pbf`]);
  return file;
}

/** The lines of `osmium export` for a filtered extract, streamed; rejects if osmium fails. */
async function* exportLines(pbf: string): AsyncGenerator<string> {
  const child = spawn("osmium", ["export", "-f", "geojsonseq", "-a", "type,id", "-x", "print_record_separator=false", "-o", "-", pbf], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  yield* createInterface({ input: child.stdout, crlfDelay: Infinity });
  const code = await exited;
  if (code !== 0) throw new Error(`osmium export failed (${code}): ${stderr.trim()}`);
}

type Options = { url: string; states: string[]; prune: boolean; limitBytes: number; workDir: string };

function options(): Options {
  const { values } = parseArgs({
    options: {
      states: { type: "string" },
      prune: { type: "boolean" },
      "no-prune": { type: "boolean" },
      "limit-mb": { type: "string" },
      "work-dir": { type: "string" },
    },
  });
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. In GitHub Actions, add it as a repository secret named DATABASE_URL.");
  const states = parseStates(values.states ?? process.env.OSM_STATES);
  const full = states.length === parseStates("").length;
  // A partial run can't prune: a tile on a state line also holds places from the neighbour, which this run didn't read.
  const prune = values["no-prune"] ? false : (values.prune ?? full);
  const limitMb = Number(values["limit-mb"] ?? DEFAULT_LIMIT_MB);
  if (!Number.isFinite(limitMb) || limitMb <= 0) throw new Error("--limit-mb must be a positive number.");
  return { url, states, prune, limitBytes: limitMb * MB, workDir: values["work-dir"] ?? join(tmpdir(), "forage-osm-import") };
}

async function guard(db: ImportDb, limitBytes: number, when: string): Promise<number> {
  const size = await dbSize(db);
  if (size > limitBytes) throw new Error(`Database is ${mb(size)} ${when}, over the ${mb(limitBytes)} limit. Stopping before Neon's storage cap.`);
  return size;
}

async function importState(db: ImportDb, opts: Options, state: string, now: number, seen: Set<string>, allTiles: Set<string>) {
  const started = Date.now();
  const before = await guard(db, opts.limitBytes, `before ${state}`);
  const raw = await download(state, opts.workDir);
  const rawBytes = statSync(raw).size;
  const filtered = join(opts.workDir, `${state}-food.osm.pbf`);
  try {
    await run("osmium", ["tags-filter", "--overwrite", "-o", filtered, raw, ...FILTERS]);
  } finally {
    rmSync(raw, { force: true });
  }
  try {
    const counts = await importLines({ q: db, now, seen, check: () => guard(db, opts.limitBytes, `during ${state}`).then(() => undefined) }, exportLines(filtered));
    const marked = await markImported(db, counts.tiles, now);
    counts.tiles.forEach((t) => allTiles.add(t));
    const after = await guard(db, opts.limitBytes, `after ${state}`);
    log(
      `${state}: extract ${mb(rawBytes)}, features ${counts.features}, places ${counts.places} (repeats ${counts.repeats}),`,
      `inserted ${counts.inserted}, updated ${counts.updated}, unchanged ${counts.unchanged}, tiles marked ${marked},`,
      `db ${mb(before)} -> ${mb(after)} (+${mb(after - before)}), ${secs(Date.now() - started)}`,
    );
    return counts;
  } finally {
    rmSync(filtered, { force: true });
  }
}

async function main() {
  const opts = options();
  mkdirSync(opts.workDir, { recursive: true });
  const started = Date.now();
  const now = started;
  const db = await openDb(opts.url);
  try {
    const startSize = await guard(db, opts.limitBytes, "at start");
    const startPlaces = await placesSize(db);
    log(`${opts.states.length} state(s), prune ${opts.prune ? "on" : "off"}, limit ${mb(opts.limitBytes)}, db ${mb(startSize)}`);
    const seen = new Set<string>();
    const allTiles = new Set<string>();
    let inserted = 0;
    for (const state of opts.states) inserted += (await importState(db, opts, state, now, seen, allTiles)).inserted;
    const deleted = opts.prune ? await pruneMissing(db, allTiles, seen) : 0;
    const endSize = await dbSize(db);
    const endPlaces = await placesSize(db);
    const [{ n }] = await db.query<{ n: string | number }>("SELECT count(*) AS n FROM places WHERE source = 'osm'");
    const perPlace = Number(n) > 0 ? endPlaces / Number(n) : 0;
    log(
      `done: ${seen.size} places seen, ${inserted} new, ${opts.prune ? `${deleted} deleted` : "prune skipped (partial run)"},`,
      `${allTiles.size} tiles; db ${mb(startSize)} -> ${mb(endSize)}; places table ${mb(startPlaces)} -> ${mb(endPlaces)}`,
      `(${Math.round(perPlace)} bytes per stored OSM place incl. indexes); ${secs(Date.now() - started)}`,
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error("[osm-import] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
