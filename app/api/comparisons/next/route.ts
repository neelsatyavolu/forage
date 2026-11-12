import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { step } from "@/lib/scoring/flow";
import { MAX_COMPARISONS } from "@/lib/scoring/pick";
import { requireUserId } from "@/lib/server/auth";
import { IdSchema, OccasionSchema } from "@/lib/types";

// GET /api/comparisons/next?placeId&occasion&asked: the place's score and the
// next question to ask about it (after an undo or a reload). opponent is null
// once asked reaches MAX_COMPARISONS, or when no same-band place is left.
const Query = z.object({ placeId: IdSchema, occasion: OccasionSchema, asked: z.coerce.number().int().min(0).max(MAX_COMPARISONS) });

export function GET(req: Request) {
  return handle(req, "next comparison", async () => {
    const userId = await requireUserId();
    const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return fail("Give a place, an occasion and how many were asked.", 400);
    const { placeId, occasion, asked } = parsed.data;
    return ok(await step(await getDb(), userId, placeId, occasion, asked), { headers: { "cache-control": "no-store" } });
  });
}
