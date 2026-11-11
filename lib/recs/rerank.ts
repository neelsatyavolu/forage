import { z } from "zod";
import type { AskAi } from "../taste/ai";
import { placeValue, type HistoryItem } from "../taste/profile";
import { placeTags } from "../taste/vocab";
import { OCCASION_LABEL, type Rec, type RecContext } from "../types";

// AI rerank of the top of the fast ranking. The model sees each candidate as
// a short id ("c4") plus compact facts, the user's taste summary and own
// places, and what they asked for. It answers with ids and one-line reasons
// only; any id that isn't a candidate is dropped, so it can't invent a place.

export const RERANK_POOL = 30;

const PickSchema = z.object({ id: z.string().max(12), reason: z.string().trim().max(400).catch("") });
const RerankSchema = z.object({ picks: z.array(PickSchema).max(RERANK_POOL) });
export type RerankOutput = z.infer<typeof RerankSchema>;

const SYSTEM = `You pick restaurants for one person from a fixed list of candidates.
Rules:
- Use only candidates from the list, by their id (like "c4"). Never name or suggest any other place.
- Order picks best first for this person and what they asked for.
- Each reason is one line, under 140 characters, and cites one of the person's own places by name when one fits ("like Mian, but brothier").
- Use only the facts given. Never invent prices, hours, ratings, dishes or awards.
Answer with JSON only: {"picks":[{"id":"c4","reason":"..."}]}.`;

const PRICE = ["", "$", "$$", "$$$", "$$$$"];

/** One candidate as the model sees it. */
export function candidateLine(id: string, rec: Rec): string {
  const p = rec.place;
  const t = p.tags as Record<string, unknown>;
  const rating = typeof t.rating === "number" ? `rating ${t.rating.toFixed(1)}${typeof t.userRatingCount === "number" ? ` (${t.userRatingCount})` : ""}` : null;
  const tags = placeTags(p).filter((x) => !x.startsWith("cuisine:") && !x.startsWith("price:")).slice(0, 10);
  return [
    `${id} | ${p.name}`,
    p.cuisine.length ? p.cuisine.join(", ") : null,
    p.priceLevel ? PRICE[p.priceLevel] : null,
    `${rec.signals.distanceKm.toFixed(1)} km`,
    rating,
    tags.length ? tags.join(" ") : null,
    `fit ${rec.signals.taste.toFixed(2)}`,
    rec.signals.visited ? `been, they gave ${rec.score.toFixed(1)}` : null,
    rec.signals.wanted ? "on their want list" : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

const ownPlace = (h: HistoryItem): string => {
  const dishes = [...new Set(h.visits.flatMap((v) => v.dishes))].slice(0, 3);
  return `- ${h.place.name}${h.place.cuisine.length ? ` (${h.place.cuisine.join(", ")})` : ""}: ${h.visits[0]?.reaction ?? "fine"}${dishes.length ? `, ordered ${dishes.join(", ")}` : ""}`;
};

export function rerankPrompt(pool: readonly Rec[], history: readonly HistoryItem[], summary: string, ctx: RecContext, count: number): string {
  const own = [...history].sort((a, b) => Math.abs(placeValue(b)) - Math.abs(placeValue(a))).slice(0, 15);
  return [
    `Taste summary: ${summary || "not written yet"}`,
    "",
    "Their own places:",
    ...(own.length ? own.map(ownPlace) : ["- none logged yet"]),
    "",
    `They want: ${ctx.want?.trim() || "a good meal nearby"}`,
    ctx.occasion ? `Occasion: ${OCCASION_LABEL[ctx.occasion]}` : null,
    ctx.partySize ? `Party of ${ctx.partySize}` : null,
    `Mode: ${ctx.mode}`,
    "",
    "Candidates:",
    ...pool.map((r, i) => candidateLine(`c${i + 1}`, r)),
    "",
    `Pick the best ${count}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Applies the model's picks to the pool: known ids only, each once, reasons
 * trimmed to one line. Picks come first in the model's order; with `keepRest`
 * the remaining candidates follow in fast order, without reasons.
 */
export function applyRerank(pool: readonly Rec[], output: RerankOutput, keepRest: boolean): Rec[] {
  const byId = new Map(pool.map((r, i) => [`c${i + 1}`, r]));
  const used = new Set<string>();
  const picked: Rec[] = [];
  for (const pick of output.picks) {
    const rec = byId.get(pick.id.trim());
    if (!rec || used.has(rec.place.id)) continue;
    used.add(rec.place.id);
    const reason = pick.reason.split("\n")[0].trim().slice(0, 200);
    picked.push(reason ? { ...rec, reason } : rec);
  }
  return keepRest ? [...picked, ...pool.filter((r) => !used.has(r.place.id))] : picked;
}

export async function rerank(
  ask: AskAi,
  pool: readonly Rec[],
  history: readonly HistoryItem[],
  summary: string,
  ctx: RecContext,
  opts: { count: number; keepRest: boolean },
): Promise<Rec[]> {
  if (pool.length === 0) return [];
  const output = await ask({ system: SYSTEM, prompt: rerankPrompt(pool, history, summary, ctx, opts.count), schema: RerankSchema });
  return applyRerank(pool, output, opts.keepRest);
}
