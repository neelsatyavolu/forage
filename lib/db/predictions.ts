import type { Prediction } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

// "We predicted 8.4, you gave 7.1": what a rec promised, and later what the user scored it.

const rowToPrediction = (r: Row): Prediction => ({
  id: Number(r.id),
  userId: r.user_id as string,
  placeId: r.place_id as string,
  predicted: Number(r.predicted),
  actual: r.actual === null || r.actual === undefined ? null : Number(r.actual),
  createdAt: fromTs(r.created_at),
});

export async function insertPrediction(q: Queryable, userId: string, placeId: string, predicted: number, now: number): Promise<Prediction> {
  const [row] = await q.query(
    "INSERT INTO predictions (user_id, place_id, predicted, created_at) VALUES ($1, $2, $3, $4) RETURNING *",
    [userId, placeId, predicted, toTs(now)],
  );
  return rowToPrediction(row);
}

/** The newest prediction for a place, or null. */
export async function latestPrediction(q: Queryable, userId: string, placeId: string): Promise<Prediction | null> {
  const [row] = await q.query("SELECT * FROM predictions WHERE user_id = $1 AND place_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1", [userId, placeId]);
  return row ? rowToPrediction(row) : null;
}

/** Records the score the user gave on the newest open prediction for the place. Null when there is none. */
export async function resolvePrediction(q: Queryable, userId: string, placeId: string, actual: number): Promise<Prediction | null> {
  const [row] = await q.query(
    `UPDATE predictions SET actual = $3 WHERE id = (
       SELECT id FROM predictions WHERE user_id = $1 AND place_id = $2 AND actual IS NULL ORDER BY created_at DESC, id DESC LIMIT 1
     ) RETURNING *`,
    [userId, placeId, actual],
  );
  return row ? rowToPrediction(row) : null;
}

/** Predictions the user has since scored, newest first: the calibration set. */
export async function listResolvedPredictions(q: Queryable, userId: string, limit = 500): Promise<Prediction[]> {
  const rows = await q.query("SELECT * FROM predictions WHERE user_id = $1 AND actual IS NOT NULL ORDER BY created_at DESC LIMIT $2", [userId, limit]);
  return rows.map(rowToPrediction);
}
