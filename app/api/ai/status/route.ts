import { connection } from "next/server";
import { ok } from "@/lib/api";
import { aiOwner, aiStatus } from "@/lib/ai";

// GET /api/ai/status: which AI accounts are connected (to the account when signed in, else this browser).
export async function GET() {
  await connection();
  return ok({ connected: await aiStatus(await aiOwner()) });
}
