import "server-only";
import { deriveKey } from "../ai/seal";
import { getDb } from "../db/client";
import { deleteLodestarLink, getLodestarLink } from "../db/links";
import { deleteTasteSeed } from "../db/taste-seeds";
import { env } from "../server/env";
import type { TasteSeed } from "../types";
import { lodestarClient, type LodestarClient } from "./client";
import { linkLabel, lodestarConfig, type LodestarConfig } from "./config";
import { importPreferencesWith } from "./import";
import { dbTokenSource, openTokens, saveTokens, tokenKey } from "./store";
import { exchangeCode, refreshTokens } from "./tokens";

// The Lodestar link wired to this server's settings, database and network.
// Linking never signs anyone in: it only stores tokens on an account that is
// already signed in to Forage.

let key: Buffer | null = null;
let flowSealKey: Buffer | null = null;
const sealKey = (): Buffer => (key ??= tokenKey(env().FORAGE_SECRET));
/** The key for the short-lived cookie that carries the PKCE verifier and state. */
export const flowKey = (): Buffer => (flowSealKey ??= deriveKey(env().FORAGE_SECRET, "lodestar-flow"));

export const config = (): LodestarConfig => lodestarConfig(env().LODESTAR_URL, env().APP_URL);

export type LinkStatus = { linked: false } | { linked: true; label: string | null; connectedAt: number };

export async function linkStatus(userId: string): Promise<LinkStatus> {
  const link = await getLodestarLink(await getDb(), userId);
  // Tokens that no longer open (the secret changed) are as good as no link.
  if (!link || !openTokens(sealKey(), userId, link.sealedTokens)) return { linked: false };
  return { linked: true, label: link.lodestarUserLabel, connectedAt: link.createdAt };
}

/** Trades the callback's code for tokens and saves them on the account. */
export async function finishLink(userId: string, code: string, verifier: string): Promise<void> {
  const cfg = config();
  const now = Date.now();
  const tokens = await exchangeCode(fetch, cfg, code, verifier, now);
  await saveTokens(await getDb(), sealKey(), userId, tokens, linkLabel(cfg), now);
}

/**
 * Removes the link and the preferences imported through it. Lodestar has no
 * revocation endpoint, so its grant stays until it expires or the user
 * removes Forage in Lodestar's settings.
 */
export async function unlink(userId: string): Promise<boolean> {
  const db = await getDb();
  await deleteTasteSeed(db, userId);
  return deleteLodestarLink(db, userId);
}

export async function lodestarFor(userId: string): Promise<LodestarClient> {
  const cfg = config();
  const db = await getDb();
  const tokens = dbTokenSource(db, sealKey(), userId, (rt) => refreshTokens(fetch, cfg, rt, Date.now()), Date.now);
  return lodestarClient({ fetch, mcpUrl: cfg.mcpUrl, tokens, now: Date.now });
}

/** Imports the linked account's Lodestar dining preferences into the taste profile. */
export async function importPreferences(userId: string): Promise<TasteSeed> {
  return importPreferencesWith(await getDb(), await lodestarFor(userId), userId, Date.now());
}
