import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CALLBACK_PATH } from "@/lib/lodestar/config";
import { LodestarError } from "@/lib/lodestar/errors";
import { FLOW_COOKIE, openFlow } from "@/lib/lodestar/flow";
import { config, finishLink, flowKey, importPreferences } from "@/lib/lodestar/server";
import { currentUserId } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { allow } from "@/lib/server/limits";

// GET /oauth/lodestar/callback: Lodestar sends the browser back here with a
// code (or an error). The code is only accepted for the Forage account that
// started the flow, with a matching state and issuer; it is traded for tokens
// that are saved on that account. Nobody is signed in to anything here.

type Outcome = "connected" | "cancelled" | "expired" | "signed-out" | "failed";

function back(outcome: Outcome): NextResponse {
  const res = NextResponse.redirect(new URL(`/account?lodestar=${outcome}`, env().APP_URL), 303);
  res.cookies.delete({ name: FLOW_COOKIE, path: CALLBACK_PATH });
  res.headers.set("cache-control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const userId = await currentUserId();
  if (!userId) return back("signed-out");
  if (!(await allow("lodestar", userId))) return back("failed");

  const cfg = config();
  const iss = params.get("iss");
  if (iss !== null && iss.replace(/\/+$/, "") !== cfg.issuer) return back("failed");

  const sealed = (await cookies()).get(FLOW_COOKIE)?.value;
  const flow = openFlow(flowKey(), userId, sealed, params.get("state"), Date.now());
  if (!flow) return back("expired");
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "cancelled" : "failed");
  const code = params.get("code");
  if (!code || code.length > 200) return back("failed");

  try {
    await finishLink(userId, code, flow.verifier);
  } catch (err) {
    console.error("[lodestar] link failed:", err instanceof LodestarError ? err.message : err);
    return back("failed");
  }
  // The link stands even if this fails; the Account page can import again.
  try {
    await importPreferences(userId);
  } catch (err) {
    console.error("[lodestar] preference import failed:", err instanceof LodestarError ? err.message : err);
  }
  return back("connected");
}
