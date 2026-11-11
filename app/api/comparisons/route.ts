import { z } from "zod";
import type { CompareStep } from "@/components/lists/types";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { answerComparison } from "@/lib/scoring/flow";
import { MAX_COMPARISONS } from "@/lib/scoring/pick";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { ComparisonInputSchema, IdSchema } from "@/lib/types";

// POST /api/comparisons {comparison: {winnerPlaceId, loserPlaceId, occasion}, next?: {subjectPlaceId, asked}}
// Saves the answer and refits the occasion. With `next` (the place being
// logged and how many questions are now answered) it also returns the next question.

const Body = z.object({
  comparison: ComparisonInputSchema,
  next: z.object({ subjectPlaceId: IdSchema, asked: z.number().int().min(1).max(MAX_COMPARISONS) }).optional(),
});

export function POST(req: Request) {
  return handle(req, "comparison", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const { comparison, next } = await readBody(req, Body);
    const db = await getDb();
    const body: CompareStep = await db.transaction((tx) => answerComparison(tx, userId, comparison, next ?? null, Date.now()));
    return ok(body);
  });
}
