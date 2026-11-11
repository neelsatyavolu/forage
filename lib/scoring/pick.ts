import type { Reaction } from "../types";

// Which place to ask "which did you like more?" about next. The most useful
// question is the one whose answer is least predictable: an opponent in the
// same reaction band whose current score is closest to the new place's.
// Places in other bands are never offered (a loved place against a disliked
// one teaches nothing), and neither is a place already compared with this one.

export const MAX_COMPARISONS = 2;

export type Candidate = { id: string; reaction: Reaction; score: number };

export function pickOpponent(subject: Candidate, others: readonly Candidate[], exclude: ReadonlySet<string>): string | null {
  const pool = others.filter((c) => c.id !== subject.id && c.reaction === subject.reaction && !exclude.has(c.id));
  if (pool.length === 0) return null;
  const best = [...pool].sort((a, b) => Math.abs(a.score - subject.score) - Math.abs(b.score - subject.score) || a.id.localeCompare(b.id))[0];
  return best.id;
}
