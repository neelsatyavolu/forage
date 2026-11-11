import type { TasteSeed } from "../types";
import type { Queryable, Row } from "./client";
import { toTs } from "./time";

// Preferences imported from Lodestar, one row per user.

const rowToSeed = (r: Row): TasteSeed => ({
  cuisines: (r.cuisines as string[] | null) ?? [],
  dietary: (r.dietary as string[] | null) ?? [],
  priceCeiling: r.price_ceiling === null || r.price_ceiling === undefined ? null : Number(r.price_ceiling),
});

export async function getTasteSeed(q: Queryable, userId: string): Promise<TasteSeed | null> {
  const [row] = await q.query("SELECT * FROM taste_seeds WHERE user_id = $1", [userId]);
  return row ? rowToSeed(row) : null;
}

/** Replaces the user's imported preferences. */
export async function saveTasteSeed(q: Queryable, userId: string, seed: TasteSeed, now: number): Promise<void> {
  await q.query(
    `INSERT INTO taste_seeds (user_id, cuisines, dietary, price_ceiling, updated_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET cuisines = EXCLUDED.cuisines, dietary = EXCLUDED.dietary,
       price_ceiling = EXCLUDED.price_ceiling, updated_at = EXCLUDED.updated_at`,
    [userId, seed.cuisines, seed.dietary, seed.priceCeiling, toTs(now)],
  );
}

export async function deleteTasteSeed(q: Queryable, userId: string): Promise<void> {
  await q.query("DELETE FROM taste_seeds WHERE user_id = $1", [userId]);
}
