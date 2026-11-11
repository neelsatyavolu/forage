// Where Forage and Lodestar meet. Forage is an OAuth public client of
// Lodestar, identified by a Client ID Metadata Document: its client_id is the
// https address of that document, which Lodestar fetches to learn the
// redirect URI. Lodestar's MCP endpoint is both the resource and, on the same
// origin, the authorization server.

export const SCOPE = "trips";
export const CLIENT_NAME = "Forage";
export const METADATA_PATH = "/oauth/client-metadata.json";
export const CALLBACK_PATH = "/oauth/lodestar/callback";

export type LodestarConfig = {
  /** Lodestar's origin, also the OAuth issuer. */
  issuer: string;
  authorizeUrl: string;
  tokenUrl: string;
  mcpUrl: string;
  clientId: string;
  redirectUri: string;
};

const trim = (url: string) => url.replace(/\/+$/, "");

export function lodestarConfig(lodestarUrl: string, appUrl: string): LodestarConfig {
  const l = trim(lodestarUrl);
  const app = trim(appUrl);
  return {
    issuer: l,
    authorizeUrl: `${l}/oauth/authorize`,
    tokenUrl: `${l}/api/oauth/token`,
    mcpUrl: `${l}/api/mcp`,
    clientId: `${app}${METADATA_PATH}`,
    redirectUri: `${app}${CALLBACK_PATH}`,
  };
}

/** The Client ID Metadata Document Lodestar reads; client_id must equal the address it is served at. */
export function clientMetadata(cfg: LodestarConfig, appUrl: string) {
  return {
    client_id: cfg.clientId,
    client_name: CLIENT_NAME,
    client_uri: trim(appUrl),
    redirect_uris: [cfg.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

/** The address that sends the user to Lodestar's consent page. */
export function authorizeUrl(cfg: LodestarConfig, state: string, challenge: string): string {
  const url = new URL(cfg.authorizeUrl);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: SCOPE,
    resource: cfg.mcpUrl,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** A short label for the connected state: Lodestar's host name. */
export const linkLabel = (cfg: LodestarConfig): string => new URL(cfg.issuer).host;
