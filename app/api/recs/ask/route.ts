import { z } from "zod";
import { HttpError, handle, ok, readBody } from "@/lib/api";
import { recommend } from "@/lib/recs";
import { requireUserId } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";
import { RecContextSchema } from "@/lib/types";

// Nearby search may refill map tiles in the background after answering (lib/places/refill).
export const maxDuration = 60;

const AskSchema = z.object({
  lat: RecContextSchema.shape.lat,
  lng: RecContextSchema.shape.lng,
  radiusKm: RecContextSchema.shape.radiusKm.max(5).default(3),
  want: z.string().trim().min(3, "Say a bit more about what you want.").max(500),
  partySize: RecContextSchema.shape.partySize,
  occasion: RecContextSchema.shape.occasion,
});

// POST /api/recs/ask {lat, lng, want, radiusKm?, partySize?, occasion?}: three picks with reasons.
// Needs ChatGPT or Grok connected (401 otherwise); new places and go-tos both qualify.
export function POST(req: Request) {
  return handle(req, "Ask", async () => {
    const userId = await requireUserId();
    const body = await readBody(req, AskSchema, 4_000);
    if (!(await allow("recs", userId))) throw new HttpError("Too many requests. Wait a few minutes and try again.", 429);
    const recs = await recommend(userId, { ...body, mode: "near" }, { filter: "all", picks: 3, requireAi: true });
    return ok({ recs }, { headers: { "cache-control": "no-store" } });
  });
}
