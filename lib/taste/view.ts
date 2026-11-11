import type { TasteProfile } from "../types";
import { topWeights } from "./profile";

/** What the taste API answers with: the summary and the strongest likes and dislikes. */
export type TasteView = { summary: string; summaryEdited: boolean; likes: [string, number][]; dislikes: [string, number][]; updatedAt: number | null };

export function tasteView(p: TasteProfile | null): TasteView {
  const top = topWeights(p?.weights ?? {}, 8);
  return { summary: p?.summary ?? "", summaryEdited: p?.summaryEdited ?? false, ...top, updatedAt: p?.updatedAt ?? null };
}
