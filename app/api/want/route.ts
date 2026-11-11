import { z } from "zod";
import type { WantResponse } from "@/components/lists/types";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPlace, getPlaces } from "@/lib/db/places";
import { addWant, listWant, removeWant } from "@/lib/db/want";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema, WantSourceSchema } from "@/lib/types";

// GET /api/want: the want-to-try list with its places.
export function GET(req: Request) {
  return handle(req, "want list", async () => {
    const userId = await requireUserId();
    const db = await getDb();
    const items = await listWant(db, userId);
    const body: WantResponse = { items, places: await getPlaces(db, items.map((i) => i.placeId)) };
    return ok(body, { headers: { "cache-control": "no-store" } });
  });
}

// POST /api/want {placeId, source?}: add a place. Adding it twice keeps the first entry.
export function POST(req: Request) {
  return handle(req, "want list add", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const { placeId, source } = await readBody(req, z.object({ placeId: IdSchema, source: WantSourceSchema.default("manual") }));
    const db = await getDb();
    if (!(await getPlace(db, placeId))) return fail("That place wasn't found.", 404);
    return ok({ item: await addWant(db, userId, placeId, source, Date.now()) });
  });
}

// DELETE /api/want {placeId}: take a place off the list.
export function DELETE(req: Request) {
  return handle(req, "want list remove", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const { placeId } = await readBody(req, z.object({ placeId: IdSchema }));
    return ok({ removed: await removeWant(await getDb(), userId, placeId) });
  });
}
