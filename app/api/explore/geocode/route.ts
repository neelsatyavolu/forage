import { z } from "zod";
import { HttpError, handle, ok } from "@/lib/api";
import { geocodeArea } from "@/lib/explore/geocode";
import { ipKey } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

const Query = z.string().trim().min(2, "Type at least two letters.").max(120);

// GET /api/explore/geocode?q=: cities and neighborhoods matching the text.
export function GET(req: Request) {
  return handle(req, "place search", async () => {
    const q = Query.safeParse(new URL(req.url).searchParams.get("q") ?? "");
    if (!q.success) throw new HttpError(q.error.issues[0]?.message ?? "Type a place name.", 400);
    const key = ipKey(req);
    if (!(await allow("places", key)) || !(await allow("placesDaily", key))) throw new HttpError("Too many searches. Wait a few minutes and try again.", 429);
    try {
      return ok({ areas: await geocodeArea(fetch, q.data) });
    } catch (err) {
      console.error("[explore] geocode failed:", err instanceof Error ? err.message : err);
      throw new HttpError("Place search isn't answering. Try again in a moment.", 502);
    }
  });
}
