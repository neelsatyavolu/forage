import "server-only";
import { HttpError } from "../api";
import { allow } from "../server/limits";
import { LodestarError } from "./errors";

// Route glue: Lodestar failures become HttpErrors that handle() answers with
// their message, and every call to Lodestar counts against the account's limit.

export async function lodestarRoute<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (!(await allow("lodestar", userId))) throw new HttpError("Too many Lodestar requests. Wait a few minutes and try again.", 429);
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LodestarError) throw new HttpError(err.message, err.status);
    throw err;
  }
}
