import { z } from "zod";
import { fail, handle, ok, readJson } from "@/lib/api";
import { deleteSchema } from "@/lib/account/input";
import { verifyPassword } from "@/lib/account/password";
import { clearAiSessions } from "@/lib/ai/session";
import { getDb } from "@/lib/db/client";
import { deleteUser, endSessions, getUser } from "@/lib/db/users";
import { progressFor } from "@/lib/rate/progress";
import { currentUserId, endSession, requireUserId, startSession } from "@/lib/server/auth";

// GET /api/account: who is signed in (a guest counts), and how many places they've rated. Signed out is a normal answer.
export function GET(req: Request) {
  return handle(req, "account check", async () => {
    const userId = await currentUserId();
    const db = await getDb();
    const user = userId ? await getUser(db, userId) : null;
    if (!user) return ok({ user: null }, { headers: { "cache-control": "no-store" } });
    return ok(
      { user: { email: user.email, guest: user.isGuest, createdAt: user.createdAt }, progress: await progressFor(db, user.id) },
      { headers: { "cache-control": "no-store" } },
    );
  });
}

// POST /api/account {action: "signout-everywhere"}: end every other session.
export function POST(req: Request) {
  return handle(req, "sign-out", async () => {
    const userId = await requireUserId();
    const body = z.object({ action: z.literal("signout-everywhere") }).safeParse(await readJson(req));
    if (!body.success) return fail("Unknown action.", 400);
    await endSessions(await getDb(), userId);
    await startSession(userId);
    return ok({});
  });
}

// DELETE /api/account {password}: delete the account and everything saved with it.
// A guest has no password and sends {}.
export function DELETE(req: Request) {
  return handle(req, "account deletion", async () => {
    const userId = await requireUserId();
    const db = await getDb();
    const user = await getUser(db, userId);
    if (!user) return fail("Sign in first.", 401);
    const raw = await readJson(req);
    if (!user.isGuest) {
      const body = deleteSchema.safeParse(raw);
      if (!body.success) return fail("Enter your password to delete your account.", 400);
      if (!user.passwordHash || !(await verifyPassword(body.data.password, user.passwordHash))) return fail("That password isn't right.", 401);
    }
    await deleteUser(db, userId);
    await clearAiSessions();
    await endSession();
    return ok({});
  });
}
