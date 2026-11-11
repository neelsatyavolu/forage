import { z } from "zod";
import { HttpError, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getTasteProfile, resetTasteSummary, saveTasteSummary } from "@/lib/db/taste";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { tasteView } from "@/lib/taste/view";

// GET /api/taste: the summary and the strongest likes and dislikes.
export function GET(req: Request) {
  return handle(req, "taste profile", async () => {
    const userId = await requireUserId();
    return ok(tasteView(await getTasteProfile(await getDb(), userId)), { headers: { "cache-control": "no-store" } });
  });
}

// PUT /api/taste {summary}: the user's own summary; the AI won't overwrite it.
// {summary: null} hands it back to the AI.
const PutSchema = z.object({ summary: z.string().trim().max(2000).nullable() });

export function PUT(req: Request) {
  return handle(req, "taste summary", async () => {
    const userId = await requireUserId();
    const { summary } = await readBody(req, PutSchema, 8_000);
    if (!(await allow("writes", userId))) throw new HttpError("Too many changes. Wait a few minutes and try again.", 429);
    const db = await getDb();
    const now = Date.now();
    if (summary === null || summary === "") await resetTasteSummary(db, userId, now);
    else await saveTasteSummary(db, userId, summary, true, now);
    return ok(tasteView(await getTasteProfile(db, userId)));
  });
}
