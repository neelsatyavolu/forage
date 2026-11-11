import { z } from "zod";
import type { LodestarConfig } from "./config";
import { LodestarError } from "./errors";

// Lodestar's token endpoint (RFC 6749): trade the authorization code and its
// PKCE verifier for tokens, and later a refresh token for a new pair. Lodestar
// rotates refresh tokens and revokes the whole grant when an old one is used
// again, so callers must save every new pair and refresh one at a time.

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export const TokensSchema = z.object({ accessToken: z.string().min(1).max(200), refreshToken: z.string().min(1).max(200), expiresAt: z.number() });

const ResponseSchema = z.object({
  access_token: z.string().min(1).max(200),
  refresh_token: z.string().min(1).max(200),
  expires_in: z.number().positive().max(366 * 24 * 3600),
  token_type: z.string().regex(/^bearer$/i),
});

const ErrorSchema = z.object({ error: z.string().max(100), error_description: z.string().max(500).optional() });

/** Refresh a minute early so a token never expires mid-request. */
export const EXPIRY_SLACK_MS = 60_000;

export const isExpired = (t: Tokens, now: number) => t.expiresAt - EXPIRY_SLACK_MS <= now;

async function post(fetchFn: typeof fetch, cfg: LodestarConfig, form: Record<string, string>, now: number): Promise<Tokens> {
  let res: Response;
  try {
    res = await fetchFn(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new LodestarError("upstream", "Can't reach Lodestar. Try again.");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ErrorSchema.safeParse(json);
    // invalid_grant: the code or refresh token is spent, expired or revoked. Only connecting again fixes it.
    if (err.success && err.data.error === "invalid_grant") throw new LodestarError("revoked", "Lodestar ended this connection. Connect again from Account.");
    throw new LodestarError("upstream", `Lodestar refused the sign-in (HTTP ${res.status}).`);
  }
  const ok = ResponseSchema.safeParse(json);
  if (!ok.success) throw new LodestarError("upstream", "Lodestar sent an unexpected answer.");
  return { accessToken: ok.data.access_token, refreshToken: ok.data.refresh_token, expiresAt: now + ok.data.expires_in * 1000 };
}

export function exchangeCode(fetchFn: typeof fetch, cfg: LodestarConfig, code: string, verifier: string, now: number): Promise<Tokens> {
  return post(fetchFn, cfg, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: cfg.redirectUri, client_id: cfg.clientId }, now);
}

export function refreshTokens(fetchFn: typeof fetch, cfg: LodestarConfig, refreshToken: string, now: number): Promise<Tokens> {
  return post(fetchFn, cfg, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId }, now);
}
