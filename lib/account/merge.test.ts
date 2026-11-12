import { describe, expect, it } from "vitest";
import { addPlace, freshDb, USER_A, USER_B } from "@/test/db";
import { getAiConnection, saveAiConnection } from "../db/ai-connections";
import { listComparisons, listScores } from "../db/scores";
import { addSkip, recentSkips } from "../db/skips";
import { saveTasteWeights } from "../db/taste";
import { getUser } from "../db/users";
import { listVisits } from "../db/visits";
import { addWant, listWant } from "../db/want";
import { logVisit, answerComparison } from "../scoring/flow";
import type { Reaction } from "../types";
import { createGuest } from "./guest";
import { mergeGuest, type Reseal } from "./merge";

const v = (placeId: string, reaction: Reaction) => ({ placeId, visitedOn: "2026-11-11", reaction, occasion: "casual" as const, rating: null, dated: false, dishes: [], note: null });
const reseal: Reseal = (provider, sealed, from, to) => (sealed === "bad" ? null : `${sealed}|${from}->${to}`);

describe("mergeGuest", () => {
  it("moves visits, comparisons, lists, skips and AI into the account, refits, and deletes the guest", async () => {
    const db = await freshDb();
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((n) => addPlace(db, { sourceId: `node/${n}` })));
    const guest = await createGuest(db, 1);
    await logVisit(db, USER_A, v(a.id, "loved"), 1);
    await addWant(db, USER_A, c.id, "manual", 1);
    await saveAiConnection(db, USER_A, "codex", "account-codex", 1);
    await logVisit(db, guest, v(b.id, "loved"), 2);
    await logVisit(db, guest, v(c.id, "loved"), 2);
    await answerComparison(db, guest, { winnerPlaceId: b.id, loserPlaceId: c.id, occasion: "casual" }, null, 3);
    await addWant(db, guest, c.id, "rate", 3);
    await addWant(db, guest, a.id, "rate", 3);
    await addSkip(db, guest, a.id, 3);
    await saveTasteWeights(db, guest, { "cuisine:x": 1 }, 3);
    await saveAiConnection(db, guest, "codex", "guest-codex", 3);
    await saveAiConnection(db, guest, "grok", "guest-grok", 3);

    expect(await mergeGuest(db, guest, USER_A, reseal, 10)).toEqual({ visits: 2 });

    expect(await getUser(db, guest)).toBeNull();
    expect(new Set((await listVisits(db, USER_A)).map((x) => x.placeId))).toEqual(new Set([a.id, b.id, c.id]));
    expect(await listComparisons(db, USER_A)).toHaveLength(1);
    const scores = new Map((await listScores(db, USER_A, "casual")).map((s) => [s.placeId, s.score]));
    expect(scores.get(b.id)!).toBeGreaterThan(scores.get(c.id)!);
    expect(scores.size).toBe(3);
    const want = await listWant(db, USER_A);
    expect(want.find((w) => w.placeId === c.id)?.source).toBe("manual");
    expect(want.map((w) => w.placeId).sort()).toEqual([a.id, c.id].sort());
    expect(await recentSkips(db, USER_A, 4)).toEqual(new Set([a.id]));
    expect(await getAiConnection(db, USER_A, "codex")).toBe("account-codex");
    expect(await getAiConnection(db, USER_A, "grok")).toBe(`guest-grok|${guest}->${USER_A}`);
  });

  it("does nothing for a full account, the same user, or into a guest", async () => {
    const db = await freshDb();
    const guest = await createGuest(db, 1);
    const other = await createGuest(db, 1);
    expect(await mergeGuest(db, USER_B, USER_A, reseal, 2)).toBeNull();
    expect(await mergeGuest(db, guest, guest, reseal, 2)).toBeNull();
    expect(await mergeGuest(db, guest, other, reseal, 2)).toBeNull();
    expect(await getUser(db, USER_B)).not.toBeNull();
    expect(await getUser(db, guest)).not.toBeNull();
  });

  it("drops an AI connection that can't be resealed", async () => {
    const db = await freshDb();
    const guest = await createGuest(db, 1);
    await saveAiConnection(db, guest, "grok", "bad", 1);
    expect(await mergeGuest(db, guest, USER_A, reseal, 2)).toEqual({ visits: 0 });
    expect(await getAiConnection(db, USER_A, "grok")).toBeNull();
  });
});
