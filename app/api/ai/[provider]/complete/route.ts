import { z } from "zod";
import { fail, handle, ok, rateLimited, readJson } from "@/lib/api";
import { exchangeCode, extractCodeAndState, isProvider } from "@/lib/ai/providers";
import { aiOwner, clearPkce, readPkce, writeSession } from "@/lib/ai/session";

const bodySchema = z.object({ callback: z.string().trim().min(1).max(4000) });

// POST /api/ai/:provider/complete {callback}: exchange the pasted callback link or code for tokens.
export function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, "AI sign-in", async () => {
    const limited = rateLimited(req, "ai-complete", 10);
    if (limited) return limited;
    const { provider } = await params;
    if (!isProvider(provider)) return fail("Unknown provider.", 404);

    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) return fail("Paste the link or code first.", 400);

    const { code, state } = extractCodeAndState(body.data.callback);
    if (!code) return fail("Couldn't find a sign-in code in what you pasted.", 400);

    const pkce = await readPkce(provider);
    if (!pkce) return fail("This sign-in expired. Click Connect again.", 400);
    // ChatGPT always returns state; Grok's bare code has none and binds to the pending attempt.
    if ((provider === "codex" && pkce.state !== state) || (state && pkce.state !== state)) {
      return fail("That link is from a different sign-in attempt. Click Connect again.", 400);
    }

    try {
      const tokens = await exchangeCode(provider, code, pkce.verifier);
      await writeSession(provider, await aiOwner(), tokens);
      await clearPkce(provider);
      return ok({ connected: provider });
    } catch (err) {
      console.error(`[ai] ${provider} token exchange failed:`, err instanceof Error ? err.message : err);
      return fail("Sign-in failed. The code may have expired. Click Connect again.", 502);
    }
  });
}
