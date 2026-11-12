import { describe, expect, it } from "vitest";
import { popUndo, pushUndo, UNDO_LIMIT, undoLabel, type UndoEntry } from "./undo";

const want = (n: number): UndoEntry => ({ kind: "want", placeId: `p${n}` });

describe("undo stack", () => {
  it("pops the newest entry without changing the old stack", () => {
    const one = pushUndo([], want(1));
    const two = pushUndo(one, { kind: "skip", placeId: "p2" });
    expect(one).toHaveLength(1);
    const popped = popUndo(two);
    expect(popped?.entry).toEqual({ kind: "skip", placeId: "p2" });
    expect(popped?.rest).toEqual(one);
    expect(two).toHaveLength(2);
  });

  it("is empty-safe", () => {
    expect(popUndo([])).toBeNull();
  });

  it("keeps only the newest entries", () => {
    let stack: UndoEntry[] = [];
    for (let i = 0; i < UNDO_LIMIT + 5; i++) stack = pushUndo(stack, want(i));
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0]).toEqual(want(5));
    expect(popUndo(stack)?.entry).toEqual(want(UNDO_LIMIT + 4));
  });

  it("names what it undoes", () => {
    expect(undoLabel({ kind: "visit", visitId: "v", placeId: "p", index: 0 })).toBe("Undo rating");
    expect(undoLabel({ kind: "compare", id: 3, placeId: "p", occasion: "casual", index: 0, askedBefore: 0 })).toBe("Undo answer");
  });
});
