import { AiError } from "../ai/errors";
import type { Queryable } from "../db/client";
import { getTasteProfile } from "../db/taste";
import { listWant } from "../db/want";
import type { AskAi } from "../taste/ai";
import { recordShown, syncFeedback, userCalibration } from "../taste/feedback";
import { refreshWeights } from "../taste/refresh";
import { plainSummary } from "../taste/summary";
import type { Place, Rec, RecContext, RecMode } from "../types";
import { predictScore, rankPlaces, type RecFilter } from "./rank";
import { RERANK_POOL, rerank } from "./rerank";

// recommend() with its I/O passed in, so tests can run it on PGlite with a
// fake place source and a fake AI.

export type RecDeps = {
  db: Queryable;
  nearby: (lat: number, lng: number, radiusKm: number) => Promise<Place[]>;
  /** The user's connected AI, or null when none is connected. */
  ai: AskAi | null;
  now: number;
};

export type RecOptions = {
  /** Default per mode: Near me and Stretch show new places, Travel and Splurge both. */
  filter?: RecFilter;
  /** How many recs to return. Default 30. */
  limit?: number;
  /** How many the AI should pick with reasons. Default 10. */
  picks?: number;
  /** Ask: fail when AI isn't connected or errors, and return only the AI's picks. */
  requireAi?: boolean;
};

const DEFAULT_FILTER: Record<RecMode, RecFilter> = { near: "new", travel: "all", splurge: "all", stretch: "new" };

/** Predictions are stored for the first few new places shown, for "we predicted X, you gave Y". */
const RECORDED = 10;

export async function recommendWith(deps: RecDeps, userId: string, ctx: RecContext, opts: RecOptions = {}): Promise<Rec[]> {
  const recs = await rankAndRerank(deps, userId, ctx, opts);
  const fresh = recs.filter((r) => !r.signals.visited).slice(0, RECORDED);
  // The raw (uncalibrated) prediction is stored too: calibration is fitted on it.
  const shown = fresh.map((r) => ({ placeId: r.place.id, score: r.score, raw: predictScore(r.signals.taste, r.signals.quality, 0) }));
  await recordShown(deps.db, userId, shown, deps.now);
  return recs;
}

async function rankAndRerank(deps: RecDeps, userId: string, ctx: RecContext, opts: RecOptions): Promise<Rec[]> {
  const { db, ai, now } = deps;
  if (opts.requireAi && !ai) throw new AiError("not_connected", "Connect ChatGPT or Grok on the Account page to use Ask.");

  await syncFeedback(db, userId);
  const [{ history, profile }, calibration, want, nearby] = await Promise.all([
    refreshWeights(db, userId, now),
    userCalibration(db, userId),
    listWant(db, userId),
    deps.nearby(ctx.lat, ctx.lng, ctx.radiusKm),
  ]);

  const input = {
    // The user's own places join the candidates so Go-to works even where the place source missed them.
    candidates: [...nearby, ...history.map((h) => h.place)],
    history,
    weights: profile.weights,
    ctx,
    filter: opts.filter ?? DEFAULT_FILTER[ctx.mode],
    wanted: new Set(want.map((w) => w.placeId)),
    calibration,
  };
  // No crowd ratings: every source of them costs money per request, so quality is neutral.
  const ranked = rankPlaces(input);
  const limit = opts.limit ?? 30;
  if (!ai || ranked.length === 0) return ranked.slice(0, limit);

  const pool = ranked.slice(0, RERANK_POOL);
  const summary = (await getTasteProfile(db, userId))?.summary || plainSummary(profile.weights);
  const count = opts.picks ?? 10;
  try {
    const picked = await rerank(ai, pool, history, summary, ctx, { count, keepRest: !opts.requireAi });
    if (opts.requireAi && picked.length === 0) throw new AiError("bad_output", "The AI didn't pick any of the nearby places. Try again.");
    return (opts.requireAi ? picked.slice(0, count) : [...picked, ...ranked.slice(RERANK_POOL)]).slice(0, limit);
  } catch (err) {
    if (opts.requireAi) throw err;
    console.error("[recs] rerank failed, using the fast ranking:", err instanceof Error ? err.message : err);
    return ranked.slice(0, limit);
  }
}
