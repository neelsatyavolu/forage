import { z } from "zod";
import { fail, handle, ok, readBody } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { nearbySearch } from "@/lib/places";
import { buildDeck, MIN_CROWD } from "@/lib/rate/deck";
import { crowdCounts, deckExclusions } from "@/lib/rate/deck-store";
import { progressFor } from "@/lib/rate/progress";
import { currentUserId, ipKey } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { IdSchema } from "@/lib/types";

// Nearby search may refill map tiles in the background after answering (lib/places/refill).
export const maxDuration = 60;

// POST /api/rate/deck {lat, lng, radiusKm?, limit?, exclude?}: nearby places to
// rate, most likely visited first. A POST only because `exclude` (ids already
// shown) can be long; it writes nothing. Works with no session.
const DeckRequest = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.2).max(3).default(1.5),
  limit: z.number().int().min(6).max(48).default(24),
  exclude: z.array(IdSchema).max(500).default([]),
});

export function POST(req: Request) {
  return handle(req, "rating deck", async () => {
    const body = await readBody(req, DeckRequest, 40_000);
    const userId = await currentUserId();
    const allowed = userId ? (await allow("places", userId)) && (await allow("placesDaily", userId)) : await allow("deckAnon", ipKey(req));
    if (!allowed) return fail("Too many requests. Wait a few minutes and try again.", 429);
    const db = await getDb();
    const now = Date.now();
    const [{ places, source }, own] = await Promise.all([nearbySearch(body.lat, body.lng, body.radiusKm), deckExclusions(db, userId, now)]);
    const crowd = await crowdCounts(db, places.map((p) => p.id), MIN_CROWD);
    const deck = buildDeck({ at: body, places, exclude: new Set([...own, ...body.exclude]), crowd, limit: body.limit });
    return ok({ ...deck, source, progress: await progressFor(db, userId) }, { headers: { "cache-control": "no-store" } });
  });
}
