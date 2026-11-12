import type { LogResponse, VisitsResponse } from "@/components/lists/types";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPlaces } from "@/lib/db/places";
import { listScores } from "@/lib/db/scores";
import { listVisits } from "@/lib/db/visits";
import { guestAtCap } from "@/lib/rate/progress";
import { logVisit } from "@/lib/scoring/flow";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { VisitInputSchema } from "@/lib/types";

// GET /api/visits: every visit the user logged, with its places and the fitted scores.
export function GET(req: Request) {
  return handle(req, "visit list", async () => {
    const userId = await requireUserId();
    const db = await getDb();
    const [visits, scores] = await Promise.all([listVisits(db, userId), listScores(db, userId)]);
    const places = await getPlaces(db, [...new Set(visits.map((v) => v.placeId))]);
    const body: VisitsResponse = { visits, places, scores };
    return ok(body, { headers: { "cache-control": "no-store" } });
  });
}

// POST /api/visits {placeId, visitedOn, reaction, occasion, rating?, dated?, dishes?, note?}: log a visit.
// Answers with the place's score and the first comparison to ask, if any.
// A guest with GUEST_RATED_CAP rated places must save an account before adding another.
export function POST(req: Request) {
  return handle(req, "visit log", async () => {
    const userId = await requireUserId();
    if (!(await allow("writes", userId))) return fail("Too many changes. Wait a few minutes and try again.", 429);
    const input = await readBody(req, VisitInputSchema);
    const db = await getDb();
    if (await guestAtCap(db, userId, input.placeId)) return fail("Save your places to keep rating.", 403);
    const body: LogResponse = await db.transaction((tx) => logVisit(tx, userId, input, Date.now()));
    return ok(body);
  });
}
