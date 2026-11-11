import { HttpError, handle, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { userAi } from "@/lib/recs";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { refreshTaste } from "@/lib/taste/refresh";
import { tasteView } from "@/lib/taste/view";

// POST /api/taste/refresh: recompute the weights; with AI connected, also write
// feature cards for your places and the summary (unless you edited it).
export function POST(req: Request) {
  return handle(req, "taste refresh", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) throw new HttpError("Too many changes. Wait a few minutes and try again.", 429);
    const ai = await userAi(userId);
    const result = await refreshTaste(await getDb(), userId, ai, Date.now());
    return ok({ ...tasteView(result.profile), aiConnected: ai !== null, cardsWritten: result.cardsWritten, summaryWritten: result.summaryWritten });
  });
}
