import { clientMetadata } from "@/lib/lodestar/config";
import { config } from "@/lib/lodestar/server";
import { env } from "@/lib/server/env";

// Read at request time: the address comes from APP_URL, which a build may not have.
export const dynamic = "force-dynamic";

// GET /oauth/client-metadata.json: Forage's Client ID Metadata Document. Its
// address is Forage's client_id at Lodestar, which fetches it to learn the
// redirect URI.
export function GET() {
  return Response.json(clientMetadata(config(), env().APP_URL), { headers: { "cache-control": "public, max-age=3600" } });
}
