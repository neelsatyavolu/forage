import { HttpError, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getPlace } from "@/lib/db/places";
import { lodestarRoute } from "@/lib/lodestar/http";
import { lodestarFor } from "@/lib/lodestar/server";
import { AddToTripSchema, diningItem } from "@/lib/lodestar/trips";
import { requireUserId } from "@/lib/server/auth";

// POST /api/lodestar/add {tripId, placeId, day, time?, note?}: put a Forage
// place on a day of a Lodestar trip as a planned meal. The restaurant's name,
// address and coordinates come from Forage's database, not the request.
export function POST(req: Request) {
  return handle(req, "add to trip", async () => {
    const userId = await requireUserId();
    const input = await readBody(req, AddToTripSchema, 4_000);
    const place = await getPlace(await getDb(), input.placeId);
    if (!place) throw new HttpError("That restaurant isn't in Forage any more.", 404);
    const [itemId] = await lodestarRoute(userId, async () => (await lodestarFor(userId)).addItems(input.tripId, [diningItem(place, input, Date.now())]));
    return ok({ itemId: itemId ?? null });
  });
}
