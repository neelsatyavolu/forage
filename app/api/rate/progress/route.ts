import { handle, ok } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { progressFor } from "@/lib/rate/progress";
import { currentUserId } from "@/lib/server/auth";

// GET /api/rate/progress: places rated so far and the milestones (picks at 5, goal 10). 0 with no session.
export function GET(req: Request) {
  return handle(req, "progress", async () => {
    const userId = await currentUserId();
    return ok(await progressFor(await getDb(), userId), { headers: { "cache-control": "no-store" } });
  });
}
