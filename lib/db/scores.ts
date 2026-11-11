import type { Comparison, ComparisonInput, Occasion, PlaceScore } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

// Head-to-head comparisons the user answered, and the per-occasion scores
// (0-10) fitted from them. The fitting itself lives with the taste engine.

const rowToComparison = (r: Row): Comparison => ({
  id: Number(r.id),
  userId: r.user_id as string,
  winnerPlaceId: r.winner_place_id as string,
  loserPlaceId: r.loser_place_id as string,
  occasion: r.occasion as Occasion,
  createdAt: fromTs(r.created_at),
});

const rowToScore = (r: Row): PlaceScore => ({
  userId: r.user_id as string,
  placeId: r.place_id as string,
  occasion: r.occasion as Occasion,
  score: Number(r.score),
  updatedAt: fromTs(r.updated_at),
});

export async function insertComparison(q: Queryable, userId: string, input: ComparisonInput, now: number): Promise<Comparison> {
  const [row] = await q.query(
    `INSERT INTO comparisons (user_id, winner_place_id, loser_place_id, occasion, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.winnerPlaceId, input.loserPlaceId, input.occasion, toTs(now)],
  );
  return rowToComparison(row);
}

/** The user's comparisons, oldest first, optionally for one occasion. */
export async function listComparisons(q: Queryable, userId: string, occasion?: Occasion): Promise<Comparison[]> {
  const rows = await q.query(
    "SELECT * FROM comparisons WHERE user_id = $1 AND ($2::text IS NULL OR occasion = $2) ORDER BY created_at, id",
    [userId, occasion ?? null],
  );
  return rows.map(rowToComparison);
}

export async function deleteComparisonsFor(q: Queryable, userId: string, placeId: string): Promise<void> {
  await q.query("DELETE FROM comparisons WHERE user_id = $1 AND (winner_place_id = $2 OR loser_place_id = $2)", [userId, placeId]);
}

/** Writes a refit: upserts every given score for the occasion. */
export async function saveScores(
  q: Queryable,
  userId: string,
  occasion: Occasion,
  scores: readonly { placeId: string; score: number }[],
  now: number,
): Promise<void> {
  for (const s of scores) {
    await q.query(
      `INSERT INTO place_scores (user_id, place_id, occasion, score, updated_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, place_id, occasion) DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at`,
      [userId, s.placeId, occasion, s.score, toTs(now)],
    );
  }
}

export async function listScores(q: Queryable, userId: string, occasion?: Occasion): Promise<PlaceScore[]> {
  const rows = await q.query(
    "SELECT * FROM place_scores WHERE user_id = $1 AND ($2::text IS NULL OR occasion = $2) ORDER BY score DESC",
    [userId, occasion ?? null],
  );
  return rows.map(rowToScore);
}

export async function getScore(q: Queryable, userId: string, placeId: string, occasion: Occasion): Promise<PlaceScore | null> {
  const [row] = await q.query("SELECT * FROM place_scores WHERE user_id = $1 AND place_id = $2 AND occasion = $3", [userId, placeId, occasion]);
  return row ? rowToScore(row) : null;
}

export async function deleteScore(q: Queryable, userId: string, placeId: string, occasion?: Occasion): Promise<void> {
  await q.query("DELETE FROM place_scores WHERE user_id = $1 AND place_id = $2 AND ($3::text IS NULL OR occasion = $3)", [userId, placeId, occasion ?? null]);
}
