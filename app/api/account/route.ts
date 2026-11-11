import { z } from "zod";
import { fail, handle, ok, readJson } from "@/lib/api";
import { deleteSchema } from "@/lib/account/input";
import { verifyPassword } from "@/lib/account/password";
import { clearAiSessions } from "@/lib/ai/session";
import { getDb } from "@/lib/db/client";
import { deleteUser, endSessions, getUser } from "@/lib/db/users";
import { currentUserId, endSession, requireUserId, startSession } from "@/lib/server/auth";

// GET /api/account: who is signed in. Signed out is a normal answer.
export function GET(req: Request) {
  return handle(req, "account check", async () => {
    const userId = await currentUserId();
    const user = userId ? await getUser(await getDb(), userId) : null;
    if (!user) return ok({ user: null });
    return ok({ user: { email: user.email, createdAt: user.createdAt } });
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
export function DELETE(req: Request) {
  return handle(req, "account deletion", async () => {
    const userId = await requireUserId();
    const body = deleteSchema.safeParse(await readJson(req));
    if (!body.success) return fail("Enter your password to delete your account.", 400);
    const db = await getDb();
    const user = await getUser(db, userId);
    if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) return fail("That password isn't right.", 401);
    await deleteUser(db, userId);
    await clearAiSessions();
    await endSession();
    return ok({});
  });
}
