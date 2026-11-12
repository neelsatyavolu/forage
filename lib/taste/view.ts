import type { TasteProfile, TasteWeights } from "../types";
import { topWeights } from "./profile";

/** What the taste API answers with: the summary and the strongest likes and dislikes. */
export type TasteView = { summary: string; summaryEdited: boolean; likes: [string, number][]; dislikes: [string, number][]; updatedAt: number | null };

/**
 * Tag families that read as noise in a list of likes ("Likes bar, restaurant"):
 * the kind of venue and the occasion. They still count in ranking.
 */
const HIDDEN_PREFIXES = ["amenity:", "occasion:"];
/** OSM's venue kind also arrives as the first attribute (`attr:restaurant`); hide those too. */
const VENUE_ATTRS = new Set(["restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "ice_cream", "bakery", "biergarten"].map((v) => `attr:${v}`));

const hidden = (k: string) => VENUE_ATTRS.has(k) || HIDDEN_PREFIXES.some((p) => k.startsWith(p));

/** The weights a person would recognise as their taste: cuisine, dish, vibe, price and real attributes. */
export const shownWeights = (weights: TasteWeights): TasteWeights => Object.fromEntries(Object.entries(weights).filter(([k]) => !hidden(k)));

export function tasteView(p: TasteProfile | null): TasteView {
  const top = topWeights(shownWeights(p?.weights ?? {}), 8);
  return { summary: p?.summary ?? "", summaryEdited: p?.summaryEdited ?? false, ...top, updatedAt: p?.updatedAt ?? null };
}
