import type { Queryable } from "../db/client";
import { getPlaces } from "../db/places";
import { listScores } from "../db/scores";
import { listVisits } from "../db/visits";
import type { Occasion, Visit } from "../types";
import type { HistoryItem } from "./profile";

/** Every place the user has logged, with its visits (newest first) and fitted scores. */
export async function loadHistory(q: Queryable, userId: string): Promise<HistoryItem[]> {
  const [visits, scores] = await Promise.all([listVisits(q, userId, { limit: 2000 }), listScores(q, userId)]);
  const byPlace = new Map<string, Visit[]>();
  for (const v of visits) byPlace.set(v.placeId, [...(byPlace.get(v.placeId) ?? []), v]);
  const scoresByPlace = new Map<string, Partial<Record<Occasion, number>>>();
  for (const s of scores) scoresByPlace.set(s.placeId, { ...scoresByPlace.get(s.placeId), [s.occasion]: s.score });
  const places = await getPlaces(q, [...byPlace.keys()]);
  return places.map((place) => ({ place, visits: byPlace.get(place.id) ?? [], scores: scoresByPlace.get(place.id) ?? {} }));
}
