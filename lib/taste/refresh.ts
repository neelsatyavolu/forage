import type { Queryable } from "../db/client";
import { getTasteProfile, saveTasteSummary, saveTasteWeights } from "../db/taste";
import type { TasteProfile } from "../types";
import type { AskAi } from "./ai";
import { storeCard, writeCards } from "./card";
import { loadHistory } from "./history";
import { computeWeights, type HistoryItem } from "./profile";
import { writeSummary } from "./summary";

/** Recomputes and saves the user's weights from their history. */
export async function refreshWeights(q: Queryable, userId: string, now: number): Promise<{ history: HistoryItem[]; profile: TasteProfile }> {
  const history = await loadHistory(q, userId);
  const profile = await saveTasteWeights(q, userId, computeWeights(history, now), now);
  return { history, profile };
}

export type RefreshResult = { profile: TasteProfile; cardsWritten: number; summaryWritten: boolean };

/**
 * The full refresh, run when the user asks for it: weights, then with AI
 * connected, tag cards for their places that lack one (and weights again so
 * the new tags count), then the summary unless the user has edited it.
 */
export async function refreshTaste(q: Queryable, userId: string, ask: AskAi | null, now: number): Promise<RefreshResult> {
  let { history, profile } = await refreshWeights(q, userId, now);
  if (!ask) return { profile, cardsWritten: 0, summaryWritten: false };

  const cards = await writeCards(ask, history.map((h) => h.place));
  for (const item of history) {
    const card = cards.get(item.place.id);
    if (card) await storeCard(q, item.place, card, now);
  }
  if (cards.size) ({ history, profile } = await refreshWeights(q, userId, now));

  const current = await getTasteProfile(q, userId);
  if (current?.summaryEdited) return { profile, cardsWritten: cards.size, summaryWritten: false };
  const summary = await writeSummary(ask, history, profile.weights);
  if (summary) profile = await saveTasteSummary(q, userId, summary, false, now);
  return { profile, cardsWritten: cards.size, summaryWritten: summary !== null };
}
