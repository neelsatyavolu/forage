import { z } from "zod";
import { HttpError, handle, ok, readBody } from "@/lib/api";
import { recommend } from "@/lib/recs";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { RecContextSchema } from "@/lib/types";

// Nearby search may refill map tiles in the background after answering (lib/places/refill).
export const maxDuration = 60;

// Near me: "Something new" leaves out places you've been, "Go-to" shows only those you liked.
const NearSchema = RecContextSchema.extend({
  mode: z.literal("near").default("near"),
  radiusKm: RecContextSchema.shape.radiusKm.max(5).default(2),
  filter: z.enum(["new", "goto"]).default("new"),
});

// POST /api/recs {lat, lng, radiusKm?, filter?, want?, occasion?}: picks around a point, best first.
export function POST(req: Request) {
  return handle(req, "recommendations", async () => {
    const userId = await requireUserId();
    const { filter, ...ctx } = await readBody(req, NearSchema, 4_000);
    if (!(await allow("recs", userId))) throw new HttpError("Too many requests. Wait a few minutes and try again.", 429);
    const recs = await recommend(userId, ctx, { filter });
    return ok({ recs, reasons: recs.some((r) => r.reason) }, { headers: { "cache-control": "no-store" } });
  });
}
