import type { Occasion, Reaction } from "@/lib/types";

// The rating flow's undo stack. Every write pushes the call that reverses it;
// Undo pops the newest. Pure, so the flow can keep it in React state.

export const UNDO_LIMIT = 20;

export type VisitFields = { reaction: Reaction; rating: number | null; occasion: Occasion };

export type UndoEntry =
  | { kind: "want"; placeId: string }
  | { kind: "skip"; placeId: string }
  | { kind: "visit"; visitId: string; placeId: string; index: number }
  | { kind: "edit"; visitId: string; placeId: string; index: number; before: VisitFields }
  | { kind: "compare"; id: number; placeId: string; occasion: Occasion; index: number; askedBefore: number };

/** A new stack with the entry on top, keeping at most UNDO_LIMIT. */
export const pushUndo = (stack: readonly UndoEntry[], entry: UndoEntry): UndoEntry[] => [...stack, entry].slice(-UNDO_LIMIT);

/** The newest entry and the stack without it, or null when there is nothing to undo. */
export function popUndo(stack: readonly UndoEntry[]): { entry: UndoEntry; rest: UndoEntry[] } | null {
  if (stack.length === 0) return null;
  return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}

/** What the Undo button's label says it will undo. */
export function undoLabel(entry: UndoEntry): string {
  switch (entry.kind) {
    case "want":
      return "Undo Want to try";
    case "skip":
      return "Undo Not been";
    case "visit":
      return "Undo rating";
    case "edit":
      return "Undo change";
    case "compare":
      return "Undo answer";
  }
}
