import { z } from "zod";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPlace } from "@/lib/db/places";
import { addSkip, removeSkip } from "@/lib/db/skips";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema } from "@/lib/types";

const SkipBody = z.object({ placeId: IdSchema });

// POST /api/rate/skips {placeId}: "Not been". Keeps the place out of the deck for 180 days. Skipping twice keeps the first.
export function POST(req: Request) {
  return handle(req, "skip", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const { placeId } = await readBody(req, SkipBody);
    const db = await getDb();
    if (!(await getPlace(db, placeId))) return fail("That place wasn't found.", 404);
    return ok({ skip: await addSkip(db, userId, placeId, Date.now()) });
  });
}

// DELETE /api/rate/skips {placeId}: undo a "Not been".
export function DELETE(req: Request) {
  return handle(req, "skip undo", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const { placeId } = await readBody(req, SkipBody);
    return ok({ removed: await removeSkip(await getDb(), userId, placeId) });
  });
}
