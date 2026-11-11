import type { Occasion, Place, Reaction, TasteWeights, Visit } from "../types";
import { KIND_WEIGHT, kindOf, placeTags } from "./vocab";

// The taste profile: weights over vocabulary tags, in [-1, 1]. Each visit adds
// how much the user liked the place (from its fitted score when there is one,
// else the reaction) to every tag on the place, faded by age. Liked tags go
// positive, disliked ones negative.

/** One place the user has been to, with every visit and their fitted scores by occasion. */
export type HistoryItem = { place: Place; visits: readonly Visit[]; scores: Partial<Record<Occasion, number>> };

const DAY_MS = 86_400_000;
export const HALF_LIFE_DAYS = 365;
/** Sums pass through tanh(sum / SATURATION), so a few strong visits nearly max a tag out. */
const SATURATION = 2;
/** How much of the user's average liking is taken out before summing (1 = all of it). */
const CENTERING = 0.8;

const REACTION_VALUE: Record<Reaction, number> = { loved: 1, fine: 0.15, disliked: -1 };
/** The 0-10 score a reaction stands for when the user hasn't ranked the place. */
export const REACTION_SCORE: Record<Reaction, number> = { loved: 8.5, fine: 6, disliked: 3 };

/** How much the user liked a visit, in [-1, 1]. A fitted score refines the reaction. */
export function visitValue(visit: Pick<Visit, "reaction" | "occasion">, scores: HistoryItem["scores"]): number {
  const fromReaction = REACTION_VALUE[visit.reaction];
  const score = scores[visit.occasion];
  return score === undefined ? fromReaction : 0.5 * fromReaction + 0.5 * ((score - 5) / 5);
}

/** The 0-10 score the user gave a visit: the fitted score, or what the reaction stands for. */
export function visitScore(visit: Pick<Visit, "reaction" | "occasion">, scores: HistoryItem["scores"]): number {
  return scores[visit.occasion] ?? REACTION_SCORE[visit.reaction];
}

/** How much the user likes a place overall, in [-1, 1]: their most recent visit counts most. */
export function placeValue(item: HistoryItem): number {
  const [latest, ...rest] = item.visits;
  if (!latest) return 0;
  const others = rest.length ? rest.reduce((s, v) => s + visitValue(v, item.scores), 0) / rest.length : visitValue(latest, item.scores);
  return 0.7 * visitValue(latest, item.scores) + 0.3 * others;
}

export const recency = (visitedOn: string, now: number): number => {
  const ageDays = Math.max(0, (now - Date.parse(`${visitedOn}T12:00:00Z`)) / DAY_MS);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
};

/** The user's own tags for a place: the dishes they ordered and their notes. */
export const historyTags = (item: HistoryItem): string[] =>
  placeTags(item.place, {
    dishes: item.visits.flatMap((v) => v.dishes),
    notes: item.visits.map((v) => v.note).filter((n): n is string => !!n),
  });

/** Profile weights from the user's visit history. */
export function computeWeights(history: readonly HistoryItem[], now: number): TasteWeights {
  // Values are centred on the user's own average, so a tag found everywhere
  // (a common price level) ends near 0 instead of soaking up their general mood.
  const all = history.flatMap((item) => item.visits.map((v) => visitValue(v, item.scores)));
  const mean = all.length > 1 ? (CENTERING * all.reduce((s, x) => s + x, 0)) / all.length : 0;
  const sums = new Map<string, number>();
  for (const item of history) {
    const tags = historyTags(item);
    for (const visit of item.visits) {
      const amount = (visitValue(visit, item.scores) - mean) * recency(visit.visitedOn, now);
      for (const t of tags) sums.set(t, (sums.get(t) ?? 0) + amount);
    }
  }
  const entries = [...sums].map(([t, s]) => [t, Math.round(Math.tanh(s / SATURATION) * 1000) / 1000] as const);
  return Object.fromEntries(entries.filter(([, w]) => w !== 0));
}

/**
 * How well a place's tags match the weights, in [0, 1]; 0.5 is no signal.
 * `skip` drops tag kinds a mode wants to ignore (Splurge ignores price).
 */
export function tasteSimilarity(tags: readonly string[], weights: TasteWeights, skip: readonly string[] = []): number {
  let sum = 0;
  let count = 0;
  for (const t of tags) {
    const kind = kindOf(t);
    if (!kind || skip.includes(kind)) continue;
    count += 1;
    sum += (weights[t] ?? 0) * KIND_WEIGHT[kind];
  }
  if (count === 0) return 0.5;
  return 0.5 + 0.5 * Math.tanh((1.5 * sum) / Math.sqrt(count));
}

/** The strongest likes and dislikes, for prompts and the profile view. */
export function topWeights(weights: TasteWeights, n: number): { likes: [string, number][]; dislikes: [string, number][] } {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  return {
    likes: sorted.filter(([, w]) => w > 0.05).slice(0, n),
    dislikes: sorted.filter(([, w]) => w < -0.05).reverse().slice(0, n),
  };
}
