import { cookies } from "next/headers";
import { handle, ok } from "@/lib/api";
import { authorizeUrl } from "@/lib/lodestar/config";
import { challengeOf, FLOW_COOKIE, FLOW_TTL_MS, newFlow, sealFlow } from "@/lib/lodestar/flow";
import { lodestarRoute } from "@/lib/lodestar/http";
import { config, flowKey } from "@/lib/lodestar/server";
import { CALLBACK_PATH } from "@/lib/lodestar/config";
import { requireUserId } from "@/lib/server/auth";

// POST /api/lodestar/connect: start linking. Saves a sealed PKCE verifier and
// state for the callback and answers with Lodestar's consent page address.
export function POST(req: Request) {
  return handle(req, "Lodestar connect", async () => {
    const userId = await requireUserId();
    return lodestarRoute(userId, async () => {
      const flow = newFlow(Date.now());
      (await cookies()).set(FLOW_COOKIE, sealFlow(flowKey(), userId, flow), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: CALLBACK_PATH,
        maxAge: FLOW_TTL_MS / 1000,
      });
      return ok({ url: authorizeUrl(config(), flow.state, challengeOf(flow.verifier)) });
    });
  });
}
