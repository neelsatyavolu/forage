import { handle, ok } from "@/lib/api";
import { lodestarRoute } from "@/lib/lodestar/http";
import { lodestarFor } from "@/lib/lodestar/server";
import { requireUserId } from "@/lib/server/auth";

// GET /api/lodestar/trips: the linked Lodestar account's trips, soonest first.
export function GET(req: Request) {
  return handle(req, "Lodestar trips", async () => {
    const userId = await requireUserId();
    const trips = await lodestarRoute(userId, async () => (await lodestarFor(userId)).listTrips());
    return ok({ trips }, { headers: { "cache-control": "no-store" } });
  });
}
