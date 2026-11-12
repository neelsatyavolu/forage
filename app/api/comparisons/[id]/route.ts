import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { undoComparison } from "@/lib/scoring/flow";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const Id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// DELETE /api/comparisons/:id[?placeId]: undo an answer and refit its occasion.
// Answers with the given place's score afterwards (null without placeId).
export function DELETE(req: Request, { params }: Ctx) {
  return handle(req, "comparison undo", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const id = Id.safeParse((await params).id);
    if (!id.success) return fail("That comparison wasn't found.", 404);
    const rawPlace = new URL(req.url).searchParams.get("placeId");
    const placeId = rawPlace === null ? null : IdSchema.safeParse(rawPlace);
    if (placeId && !placeId.success) return fail("That place id isn't valid.", 400);
    const db = await getDb();
    return ok(await db.transaction((tx) => undoComparison(tx, userId, id.data, placeId ? placeId.data : null, Date.now())));
  });
}
