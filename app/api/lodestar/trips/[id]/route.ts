import { HttpError, handle, ok } from "@/lib/api";
import { lodestarRoute } from "@/lib/lodestar/http";
import { lodestarFor } from "@/lib/lodestar/server";
import { diningByDay, tripDays } from "@/lib/lodestar/trips";
import { requireUserId } from "@/lib/server/auth";
import { IdSchema } from "@/lib/types";

// GET /api/lodestar/trips/:id: one trip's days and the meals already planned on each.
export function GET(req: Request, ctx: RouteContext<"/api/lodestar/trips/[id]">) {
  return handle(req, "Lodestar trip", async () => {
    const userId = await requireUserId();
    const id = IdSchema.safeParse((await ctx.params).id);
    if (!id.success) throw new HttpError("That trip id isn't valid.", 400);
    const trip = await lodestarRoute(userId, async () => (await lodestarFor(userId)).getTrip(id.data));
    const meals = diningByDay(trip);
    const days = tripDays(trip.startDate, trip.endDate).map((day) => ({ day, meals: (meals[day] ?? []).map((m) => ({ title: m.title, time: m.startTime ?? null })) }));
    return ok(
      { trip: { id: trip.id, title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate }, days },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
