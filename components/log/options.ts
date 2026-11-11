import { OCCASION_LABEL, OCCASIONS, type Occasion, type Reaction } from "@/lib/types";

export const REACTION_OPTIONS: { value: Reaction; label: string }[] = [
  { value: "loved", label: "Loved it" },
  { value: "fine", label: "It was fine" },
  { value: "disliked", label: "Didn't like it" },
];

export const OCCASION_OPTIONS: { value: Occasion; label: string }[] = OCCASIONS.map((o) => ({ value: o, label: OCCASION_LABEL[o] }));

/** Today as YYYY-MM-DD in the browser's time zone. */
export const today = (): string => new Date().toLocaleDateString("en-CA");

/** "ramen, gyoza ,, " -> ["ramen", "gyoza"]: dishes typed as a comma list. */
export function parseDishes(text: string): string[] {
  return [...new Set(text.split(",").map((d) => d.trim().slice(0, 100)).filter(Boolean))].slice(0, 20);
}
