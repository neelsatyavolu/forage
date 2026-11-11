import type { PlaceResponse } from "@/components/lists/types";
import { fail, handle, HttpError, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPlace } from "@/lib/db/places";
import { listScores } from "@/lib/db/scores";
import { listVisits } from "@/lib/db/visits";
import { isWanted } from "@/lib/db/want";
import { placeLiveDetails } from "@/lib/places";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema } from "@/lib/types";

// GET /api/places/:id: a place, the user's visits and scores for it, and
// Google's live details when a key is set (fetched now, never stored).

export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, "place lookup", async () => {
    const userId = await requireUserId();
    const id = IdSchema.safeParse((await params).id);
    if (!id.success) return fail("That place wasn't found.", 404);
    const db = await getDb();
    const place = await getPlace(db, id.data);
    if (!place) return fail("That place wasn't found.", 404);
    const [visits, scores, wanted] = await Promise.all([
      listVisits(db, userId, { placeId: place.id }),
      listScores(db, userId).then((all) => all.filter((s) => s.placeId === place.id)),
      isWanted(db, userId, place.id),
    ]);
    let live: PlaceResponse["live"] = null;
    let liveError: string | null = null;
    if (await allow("places", userId)) {
      try {
        live = await placeLiveDetails(place.id);
      } catch (err) {
        // The page still works from stored data; say why the live part is missing.
        liveError = err instanceof HttpError ? err.message : "Live details aren't available right now.";
        if (!(err instanceof HttpError)) console.error("[places] live details failed:", err instanceof Error ? err.message : err);
      }
    }
    const body: PlaceResponse = { place, live, liveError, visits, scores, wanted };
    return ok(body);
  });
}
