import { fail, handle, ok, readJson } from "@/lib/api";
import { signIn } from "@/lib/account/accounts";
import { loginSchema } from "@/lib/account/input";
import { mergeGuest } from "@/lib/account/merge";
import { resealForUser } from "@/lib/ai/session";
import { getDb } from "@/lib/db/client";
import { currentUserId, ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

// POST /api/account/login {email, password}
// From a guest session, the guest's places move into the account and the guest is deleted.
export function POST(req: Request) {
  return handle(req, "sign-in", async () => {
    if (!(await allow("login", ipKey(req)))) return fail("Too many attempts. Try again in 15 minutes.", 429);
    const body = loginSchema.safeParse(await readJson(req));
    if (!body.success) return fail("Enter your email and password.", 400);
    const db = await getDb();
    const userId = await signIn(db, body.data);
    if (!userId) return fail("That email and password don't match an account.", 401);
    const current = await currentUserId();
    const merged = current ? await mergeGuest(db, current, userId, resealForUser, Date.now()) : null;
    await startSession(userId);
    return ok({ user: { email: body.data.email }, ...(merged ? { merged } : {}) });
  });
}
