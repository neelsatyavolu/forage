import type { VisitEditResponse } from "@/components/lists/types";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { editVisit, removeVisit } from "@/lib/scoring/flow";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema, VisitPatchSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

async function visitId(params: Ctx["params"]): Promise<string | null> {
  const id = IdSchema.safeParse((await params).id);
  return id.success ? id.data : null;
}

// PATCH /api/visits/:id {visitedOn?, reaction?, occasion?, rating?, dated?, dishes?, note?}: change a visit and refit.
// Fields left out keep their value. Answers with the visit and the place's score in its occasion now.
export function PATCH(req: Request, { params }: Ctx) {
  return handle(req, "visit edit", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const id = await visitId(params);
    if (!id) return fail("That visit wasn't found.", 404);
    const patch = await readBody(req, VisitPatchSchema);
    const db = await getDb();
    const body: VisitEditResponse = await db.transaction((tx) => editVisit(tx, userId, id, patch, Date.now()));
    return ok(body);
  });
}

// DELETE /api/visits/:id: remove a visit and refit its occasion.
export function DELETE(req: Request, { params }: Ctx) {
  return handle(req, "visit delete", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const id = await visitId(params);
    if (!id) return fail("That visit wasn't found.", 404);
    const db = await getDb();
    await db.transaction((tx) => removeVisit(tx, userId, id, Date.now()));
    return ok({});
  });
}
