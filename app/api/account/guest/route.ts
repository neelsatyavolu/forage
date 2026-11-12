import { waitUntil } from "@vercel/functions";
import { fail, handle, ok } from "@/lib/api";
import { createGuest, sweepGuests } from "@/lib/account/guest";
import { getDb } from "@/lib/db/client";
import { getUser } from "@/lib/db/users";
import { currentUserId, ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

// POST /api/account/guest {}: start as a guest. Clients call it right before
// their first write, never on page load. With a live session (guest or full)
// it answers with that user and creates nothing.
export function POST(req: Request) {
  return handle(req, "guest start", async () => {
    const db = await getDb();
    const existing = await currentUserId();
    const user = existing ? await getUser(db, existing) : null;
    if (user) return ok({ user: { guest: user.isGuest, email: user.email }, created: false });
    if (!(await allow("guest", ipKey(req)))) return fail("Too many new visitors from here. Try again later.", 429);
    const now = Date.now();
    const id = await createGuest(db, now);
    await startSession(id);
    // Cleanup of abandoned guests rides on new ones, after the response.
    waitUntil(sweepGuests(db, now));
    return ok({ user: { guest: true, email: null }, created: true });
  });
}
