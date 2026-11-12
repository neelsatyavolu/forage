import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { nearbyPlaces, searchPlaces } from "@/lib/places";
import { currentUserId, ipKey } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

// Nearby search may refill map tiles in the background after answering (lib/places/refill).
export const maxDuration = 60;

// GET /api/places?q=text[&lat&lng]: search places to eat or drink.
// GET /api/places?lat&lng[&radiusKm]: places near a point, nearest first.

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max);
const query = z.union([
  z.object({ q: z.string().trim().min(1).max(200), lat: coord(-90, 90).optional(), lng: coord(-180, 180).optional() }),
  z.object({ lat: coord(-90, 90), lng: coord(-180, 180), radiusKm: z.coerce.number().min(0.1).max(10).default(1.5) }),
]);

const MAX_NEARBY = 100;

export function GET(req: Request) {
  return handle(req, "place search", async () => {
    // No session is fine (the rating deck's search runs before the first write); limits then key on the IP.
    const key = (await currentUserId()) ?? ipKey(req);
    if (!(await allow("places", key)) || !(await allow("placesDaily", key))) return fail("Too many searches. Wait a few minutes and try again.", 429);
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = query.safeParse(params);
    if (!parsed.success) return fail("Type a place name, or share a location.", 400);
    const p = parsed.data;
    if ("q" in p) {
      const near = p.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined;
      return ok({ places: await searchPlaces(p.q, near) });
    }
    return ok({ places: (await nearbyPlaces(p.lat, p.lng, p.radiusKm)).slice(0, MAX_NEARBY) });
  });
}
