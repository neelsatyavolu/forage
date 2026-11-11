import { handle, ok } from "@/lib/api";
import { linkStatus, unlink } from "@/lib/lodestar/server";
import { requireUserId } from "@/lib/server/auth";

// GET /api/lodestar: whether this account is linked to Lodestar.
export function GET(req: Request) {
  return handle(req, "Lodestar check", async () => ok(await linkStatus(await requireUserId()), { headers: { "cache-control": "no-store" } }));
}

// DELETE /api/lodestar: remove the link and its tokens.
export function DELETE(req: Request) {
  return handle(req, "Lodestar disconnect", async () => {
    await unlink(await requireUserId());
    return ok({ linked: false });
  });
}
