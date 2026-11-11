import type { Queryable } from "../db/client";
import { saveTasteSeed } from "../db/taste-seeds";
import { refreshWeights } from "../taste/refresh";
import type { TasteSeed } from "../types";
import type { LodestarClient } from "./client";
import { toSeed } from "./preferences";

/**
 * Imports the linked account's Lodestar dining preferences, replacing any
 * earlier import, and refreshes the taste weights so liked cuisines count
 * right away (weights from the user's own visits are never lowered).
 */
export async function importPreferencesWith(q: Queryable, client: Pick<LodestarClient, "getPreferences">, userId: string, now: number): Promise<TasteSeed> {
  const seed = toSeed(await client.getPreferences());
  await saveTasteSeed(q, userId, seed, now);
  await refreshWeights(q, userId, now);
  return seed;
}
