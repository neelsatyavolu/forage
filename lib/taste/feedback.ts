import type { Queryable } from "../db/client";
import { insertPrediction, latestPrediction, listResolvedPredictions } from "../db/predictions";
import { fromTs } from "../db/time";
import type { Occasion, Prediction, Reaction } from "../types";
import { visitScore } from "./profile";

// "We predicted 8.4, you gave 7.1." When recs are shown, the predicted score
// of each is stored. When the user later logs a visit to one of those places,
// the prediction is resolved with the score they gave. The average miss
// becomes a per-user calibration offset added to future predictions.

const DAY_MS = 86_400_000;
/** A place shown again within this window keeps its first open prediction. */
const REPEAT_WINDOW_MS = 30 * DAY_MS;
/** Pseudo-count pulling the offset toward 0 until there is enough feedback. */
const PRIOR = 3;
const MAX_OFFSET = 2;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Mean (actual - predicted), shrunk toward 0 for small samples and clamped to ±2. */
export function calibrationOffset(resolved: readonly Pick<Prediction, "predicted" | "actual">[]): number {
  const misses = resolved.filter((p) => p.actual !== null).map((p) => (p.actual as number) - p.predicted);
  const offset = misses.reduce((s, m) => s + m, 0) / (misses.length + PRIOR);
  return round1(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offset)));
}

export async function userCalibration(q: Queryable, userId: string): Promise<number> {
  return calibrationOffset(await listResolvedPredictions(q, userId, 50));
}

/** Stores predictions for recs the user was shown, skipping places with a recent open one. */
export async function recordShown(q: Queryable, userId: string, shown: readonly { placeId: string; score: number }[], now: number): Promise<number> {
  let stored = 0;
  for (const s of shown) {
    const last = await latestPrediction(q, userId, s.placeId);
    if (last && last.actual === null && now - last.createdAt < REPEAT_WINDOW_MS) continue;
    await insertPrediction(q, userId, s.placeId, round1(Math.max(0, Math.min(10, s.score))), now);
    stored += 1;
  }
  return stored;
}

type OpenRow = { id: string | number; place_id: string; created_at: unknown; reaction: Reaction; occasion: Occasion; score: number | null };

/**
 * Resolves every open prediction whose place the user has since logged: the
 * first visit on or after the day of the prediction gives the actual score.
 * Returns how many were resolved.
 */
export async function syncFeedback(q: Queryable, userId: string): Promise<number> {
  const rows = await q.query<OpenRow>(
    `SELECT p.id, p.place_id, p.created_at, v.reaction, v.occasion, s.score
     FROM predictions p
     JOIN LATERAL (
       SELECT reaction, occasion FROM visits
       WHERE user_id = p.user_id AND place_id = p.place_id AND visited_on >= (p.created_at AT TIME ZONE 'UTC')::date
       ORDER BY visited_on, created_at LIMIT 1
     ) v ON true
     LEFT JOIN place_scores s ON s.user_id = p.user_id AND s.place_id = p.place_id AND s.occasion = v.occasion
     WHERE p.user_id = $1 AND p.actual IS NULL`,
    [userId],
  );
  for (const r of rows) {
    const scores = r.score === null ? {} : { [r.occasion]: Number(r.score) };
    await q.query("UPDATE predictions SET actual = $3 WHERE user_id = $1 AND id = $2", [userId, r.id, round1(visitScore(r, scores))]);
  }
  return rows.length;
}

export type FeedbackView = { predicted: number; actual: number; at: number };

/** The newest resolved prediction for a place, for "we predicted X, you gave Y". */
export async function feedbackFor(q: Queryable, userId: string, placeId: string): Promise<FeedbackView | null> {
  const [row] = await q.query<{ predicted: number; actual: number; created_at: unknown }>(
    `SELECT predicted, actual, created_at FROM predictions
     WHERE user_id = $1 AND place_id = $2 AND actual IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId, placeId],
  );
  return row ? { predicted: Number(row.predicted), actual: Number(row.actual), at: fromTs(row.created_at) } : null;
}
