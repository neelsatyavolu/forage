import "server-only";
import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { currentUserId } from "../server/auth";
import { RATE_DISMISSED_COOKIE, shouldOpenRate } from "./entry";
import { progressFor } from "./progress";

/** True when opening Forage should land on /rate: fewer than 10 rated and the flow not closed here. */
export async function opensOnRate(): Promise<boolean> {
  if ((await cookies()).get(RATE_DISMISSED_COOKIE)?.value === "1") return false;
  const userId = await currentUserId();
  const { rated } = userId ? await progressFor(await getDb(), userId) : { rated: 0 };
  return shouldOpenRate(rated, false);
}
