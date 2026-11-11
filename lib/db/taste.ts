import type { TasteProfile, TasteWeights } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

const rowToProfile = (r: Row): TasteProfile => ({
  userId: r.user_id as string,
  weights: (r.weights as TasteWeights | null) ?? {},
  summary: r.summary as string,
  summaryEdited: Boolean(r.summary_edited),
  updatedAt: fromTs(r.updated_at),
});

export async function getTasteProfile(q: Queryable, userId: string): Promise<TasteProfile | null> {
  const [row] = await q.query("SELECT * FROM taste_profiles WHERE user_id = $1", [userId]);
  return row ? rowToProfile(row) : null;
}

/** Stores recomputed weights. The summary is left as it is. */
export async function saveTasteWeights(q: Queryable, userId: string, weights: TasteWeights, now: number): Promise<TasteProfile> {
  const [row] = await q.query(
    `INSERT INTO taste_profiles (user_id, weights, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE SET weights = EXCLUDED.weights, updated_at = EXCLUDED.updated_at RETURNING *`,
    [userId, JSON.stringify(weights), toTs(now)],
  );
  return rowToProfile(row);
}

/**
 * Stores a taste summary. `edited` is true when the user wrote it; an
 * AI-written summary (edited false) never replaces one the user edited.
 */
export async function saveTasteSummary(q: Queryable, userId: string, summary: string, edited: boolean, now: number): Promise<TasteProfile> {
  const [row] = await q.query(
    `INSERT INTO taste_profiles (user_id, summary, summary_edited, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       summary = CASE WHEN taste_profiles.summary_edited AND NOT EXCLUDED.summary_edited THEN taste_profiles.summary ELSE EXCLUDED.summary END,
       summary_edited = taste_profiles.summary_edited OR EXCLUDED.summary_edited,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [userId, summary, edited, toTs(now)],
  );
  return rowToProfile(row);
}

/** Lets the AI write the summary again (the user cleared their edit). */
export async function resetTasteSummary(q: Queryable, userId: string, now: number): Promise<void> {
  await q.query("UPDATE taste_profiles SET summary = '', summary_edited = false, updated_at = $2 WHERE user_id = $1", [userId, toTs(now)]);
}
