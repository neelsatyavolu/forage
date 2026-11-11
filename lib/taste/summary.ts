import { z } from "zod";
import type { TasteWeights } from "../types";
import type { AskAi } from "./ai";
import { placeValue, topWeights, type HistoryItem } from "./profile";
import { valueOf } from "./vocab";

// The plain-English taste summary. The AI writes it from the user's own
// history; once the user edits it, it is theirs (summary_edited) and the AI
// never overwrites it.

const SummarySchema = z.object({ summary: z.string().trim().min(1).max(600) });

const SYSTEM = `You write a short taste summary of one person's restaurant preferences, from their own history.
Two or three plain sentences, under 400 characters, in the third person without a name ("Loves hand-pulled noodles and natural wine bars; dislikes scene-y spots.").
Mention specific cuisines, dishes and kinds of places. Use only what the history shows. No praise, no filler.
Answer with JSON only: {"summary": "..."}.`;

const label = (t: string) => `${t.slice(0, t.indexOf(":"))} ${valueOf(t).replace(/_/g, " ")}`;

const line = (item: HistoryItem): string => {
  const dishes = [...new Set(item.visits.flatMap((v) => v.dishes))].slice(0, 5);
  const notes = item.visits.map((v) => v.note).filter(Boolean).slice(0, 2);
  return [
    `- ${item.place.name}`,
    item.place.cuisine.length ? ` (${item.place.cuisine.join(", ")})` : "",
    `: ${item.visits[0]?.reaction ?? "fine"}`,
    dishes.length ? `; ordered ${dishes.join(", ")}` : "",
    notes.length ? `; notes: ${notes.join(" / ").slice(0, 200)}` : "",
  ].join("");
};

export function summaryPrompt(history: readonly HistoryItem[], weights: TasteWeights): string {
  const ranked = [...history].sort((a, b) => placeValue(b) - placeValue(a));
  const top = topWeights(weights, 12);
  return [
    "Places they logged (best first):",
    ...ranked.slice(0, 25).map(line),
    "",
    `Strongest likes: ${top.likes.map(([t]) => label(t)).join(", ") || "none yet"}`,
    `Strongest dislikes: ${top.dislikes.map(([t]) => label(t)).join(", ") || "none yet"}`,
  ].join("\n");
}

/** A summary without AI, from the weights alone. Used in prompts when there is no written one. */
export function plainSummary(weights: TasteWeights): string {
  const top = topWeights(weights, 6);
  const likes = top.likes.map(([t]) => valueOf(t).replace(/_/g, " "));
  const dislikes = top.dislikes.map(([t]) => valueOf(t).replace(/_/g, " "));
  return [likes.length ? `Likes ${likes.join(", ")}.` : "", dislikes.length ? `Dislikes ${dislikes.join(", ")}.` : ""].filter(Boolean).join(" ");
}

export async function writeSummary(ask: AskAi, history: readonly HistoryItem[], weights: TasteWeights): Promise<string | null> {
  if (history.length === 0) return null;
  const { summary } = await ask({ system: SYSTEM, prompt: summaryPrompt(history, weights), schema: SummarySchema });
  return summary;
}
