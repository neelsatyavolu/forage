import { HttpError, handle, ok, readBody } from "@/lib/api";
import { recommend } from "@/lib/recs";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { RecContextSchema } from "@/lib/types";

// Explore only offers the three away-from-home modes; Near me uses "near".
const ExploreContextSchema = RecContextSchema.extend({ mode: RecContextSchema.shape.mode.exclude(["near"]) });

// POST /api/explore/recs {lat, lng, radiusKm, mode, want?, occasion?}: picks around a chosen place.
export function POST(req: Request) {
  return handle(req, "recommendations", async () => {
    const userId = await requireUserId();
    const ctx = await readBody(req, ExploreContextSchema, 4_000);
    if (!(await allow("recs", userId))) throw new HttpError("Too many requests. Wait a few minutes and try again.", 429);
    return ok({ recs: await recommend(userId, ctx) });
  });
}
