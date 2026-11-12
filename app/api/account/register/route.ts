import { fail, handle, ok, readJson } from "@/lib/api";
import { register } from "@/lib/account/accounts";
import { upgradeToAccount } from "@/lib/account/guest";
import { MIN_PASSWORD_LENGTH, registerSchema } from "@/lib/account/input";
import { getDb } from "@/lib/db/client";
import { isGuest } from "@/lib/db/users";
import { currentUserId, ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

// POST /api/account/register {email, password}: create an account and sign in.
// From a guest session it turns that guest into the account, same id, so everything rated stays.
export function POST(req: Request) {
  return handle(req, "sign-up", async () => {
    if (!(await allow("register", ipKey(req)))) return fail("Too many new accounts from here. Try again later.", 429);
    const body = registerSchema.safeParse(await readJson(req));
    if (!body.success) return fail(`Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    const db = await getDb();
    const current = await currentUserId();
    if (current && (await isGuest(db, current))) {
      const result = await upgradeToAccount(db, current, body.data);
      if (result === "email-taken") return fail("An account with that email already exists. Sign in to keep these places.", 409);
      if (result === "upgraded") {
        await startSession(current);
        return ok({ user: { email: body.data.email }, upgraded: true });
      }
    }
    const userId = await register(db, { ...body.data, now: Date.now() });
    if (!userId) return fail("An account with that email already exists. Sign in instead.", 409);
    await startSession(userId);
    return ok({ user: { email: body.data.email }, upgraded: false });
  });
}
