import { handle, ok } from "@/lib/api";
import { lodestarRoute } from "@/lib/lodestar/http";
import { importPreferences } from "@/lib/lodestar/server";
import { requireUserId } from "@/lib/server/auth";

// POST /api/lodestar/preferences: import the linked Lodestar account's dining
// preferences (liked cuisines, dietary needs, budget) into the taste profile.
export function POST(req: Request) {
  return handle(req, "Lodestar preferences", async () => {
    const userId = await requireUserId();
    const seed = await lodestarRoute(userId, () => importPreferences(userId));
    return ok({ seed }, { headers: { "cache-control": "no-store" } });
  });
}
