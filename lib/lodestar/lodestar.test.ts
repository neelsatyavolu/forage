import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeUrl, clientMetadata, lodestarConfig } from "./config";
import { LodestarError } from "./errors";
import { fakeFetch, json } from "./fake";
import { challengeOf, newFlow, openFlow, sealFlow } from "./flow";
import { exchangeCode, refreshTokens } from "./tokens";
import { deriveKey } from "../ai/seal";

const cfg = lodestarConfig("https://lodestar.example/", "https://forage.example");
const key = deriveKey("a-test-secret-of-length", "lodestar-flow");
const U1 = "00000000-0000-4000-8000-00000000000a";
const U2 = "00000000-0000-4000-8000-00000000000b";

describe("config", () => {
  it("derives every address from the two origins", () => {
    expect(cfg).toEqual({
      issuer: "https://lodestar.example",
      authorizeUrl: "https://lodestar.example/oauth/authorize",
      tokenUrl: "https://lodestar.example/api/oauth/token",
      mcpUrl: "https://lodestar.example/api/mcp",
      clientId: "https://forage.example/oauth/client-metadata.json",
      redirectUri: "https://forage.example/oauth/lodestar/callback",
    });
  });

  it("publishes a metadata document whose client_id is its own address", () => {
    const doc = clientMetadata(cfg, "https://forage.example");
    expect(doc.client_id).toBe(cfg.clientId);
    expect(doc.redirect_uris).toEqual([cfg.redirectUri]);
    expect(doc.token_endpoint_auth_method).toBe("none");
  });

  it("asks for a code with PKCE S256, state, scope and the MCP resource", () => {
    const u = new URL(authorizeUrl(cfg, "st", "ch"));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, code_challenge: "ch", code_challenge_method: "S256", state: "st", scope: "trips", resource: cfg.mcpUrl,
    });
  });
});

describe("flow cookie", () => {
  it("makes an S256 challenge of the verifier", () => {
    const f = newFlow(0);
    expect(challengeOf(f.verifier)).toBe(createHash("sha256").update(f.verifier).digest("base64url"));
    expect(challengeOf(f.verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
  });

  it("opens only for the same account, matching state, before it expires", () => {
    const f = newFlow(1000);
    const sealed = sealFlow(key, U1, f);
    expect(openFlow(key, U1, sealed, f.state, 2000)).toEqual(f);
    expect(openFlow(key, U2, sealed, f.state, 2000)).toBeNull();
    expect(openFlow(key, U1, sealed, "other-state-value-xx", 2000)).toBeNull();
    expect(openFlow(key, U1, sealed, f.state, f.expiresAt)).toBeNull();
    expect(openFlow(key, U1, undefined, f.state, 2000)).toBeNull();
    expect(openFlow(key, U1, sealed, null, 2000)).toBeNull();
    expect(openFlow(key, U1, `${sealed}x`, f.state, 2000)).toBeNull();
  });
});

describe("token endpoint", () => {
  const pair = { access_token: "lsa_a", refresh_token: "lsr_r", expires_in: 3600, token_type: "Bearer", scope: "trips" };

  it("exchanges a code form-encoded as a public client", async () => {
    const f = fakeFetch(() => json(pair));
    expect(await exchangeCode(f.fetch, cfg, "lsc_code", "verifier", 1000)).toEqual({ accessToken: "lsa_a", refreshToken: "lsr_r", expiresAt: 1000 + 3600_000 });
    expect(f.calls[0].url).toBe(cfg.tokenUrl);
    const form = new URLSearchParams(String(f.calls[0].init.body));
    expect(Object.fromEntries(form)).toEqual({ grant_type: "authorization_code", code: "lsc_code", code_verifier: "verifier", redirect_uri: cfg.redirectUri, client_id: cfg.clientId });
  });

  it("refreshes with the refresh token and client id", async () => {
    const f = fakeFetch(() => json(pair));
    await refreshTokens(f.fetch, cfg, "lsr_old", 0);
    expect(Object.fromEntries(new URLSearchParams(String(f.calls[0].init.body)))).toEqual({ grant_type: "refresh_token", refresh_token: "lsr_old", client_id: cfg.clientId });
  });

  it("reports invalid_grant as revoked and other failures as upstream", async () => {
    await expect(refreshTokens(fakeFetch(() => json({ error: "invalid_grant" }, 400)).fetch, cfg, "x", 0)).rejects.toMatchObject({ code: "revoked" });
    await expect(refreshTokens(fakeFetch(() => json({ error: "too_many_requests" }, 429)).fetch, cfg, "x", 0)).rejects.toMatchObject({ code: "upstream" });
    await expect(refreshTokens(fakeFetch(() => json({ access_token: "a" })).fetch, cfg, "x", 0)).rejects.toBeInstanceOf(LodestarError);
    const offline = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(refreshTokens(offline.fetch, cfg, "x", 0)).rejects.toMatchObject({ code: "upstream" });
  });
});
