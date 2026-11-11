import { HttpError, handle, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { requireUserId } from "@/lib/server/auth";
import { feedbackFor, syncFeedback } from "@/lib/taste/feedback";
import { IdSchema } from "@/lib/types";

// GET /api/feedback?placeId=: "we predicted X, you gave Y" for a place you
// logged after it was recommended, or null. Resolves any open predictions first.
export function GET(req: Request) {
  return handle(req, "feedback", async () => {
    const userId = await requireUserId();
    const placeId = IdSchema.safeParse(new URL(req.url).searchParams.get("placeId"));
    if (!placeId.success) throw new HttpError("Give a place id.", 400);
    const db = await getDb();
    await syncFeedback(db, userId);
    return ok({ feedback: await feedbackFor(db, userId, placeId.data) }, { headers: { "cache-control": "no-store" } });
  });
}
