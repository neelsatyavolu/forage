import { z } from "zod";
import { LodestarError } from "./errors";

// One MCP tool call over Streamable HTTP: a JSON-RPC POST with the bearer
// token. Lodestar's server is stateless, so no initialize handshake or session
// id is needed. The answer comes back as JSON or as a server-sent event stream
// holding the one JSON-RPC response.

export const PROTOCOL_VERSION = "2025-06-18";

export type ToolOutput = { text: string; data: unknown };

const ResultSchema = z.object({
  content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).default([]),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
});

const RpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});

/** The JSON-RPC message answering `id` in an SSE body, or null. */
export function fromEventStream(body: string, id: number): unknown {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const msg = JSON.parse(data) as { id?: unknown };
      if (msg && msg.id === id) return msg;
    } catch {
      // Not JSON: a comment or keep-alive. Skip it.
    }
  }
  return null;
}

let nextId = 0;

export async function callTool(fetchFn: typeof fetch, mcpUrl: string, accessToken: string, name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const id = ++nextId;
  let res: Response;
  try {
    res = await fetchFn(mcpUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LodestarError("upstream", "Can't reach Lodestar. Try again.");
  }
  if (res.status === 401) throw new LodestarError("unauthorized", "Lodestar didn't accept the sign-in. Connect again from Account.");
  if (!res.ok) throw new LodestarError("upstream", `Lodestar had a problem (HTTP ${res.status}).`);

  const body = await res.text();
  const raw = (res.headers.get("content-type") ?? "").includes("text/event-stream") ? fromEventStream(body, id) : safeJson(body);
  const rpc = RpcSchema.safeParse(raw);
  if (!rpc.success || rpc.data.id !== id) throw new LodestarError("upstream", "Lodestar sent an unexpected answer.");
  if (rpc.data.error) throw new LodestarError("upstream", "Lodestar couldn't run that.");
  const result = ResultSchema.safeParse(rpc.data.result);
  if (!result.success) throw new LodestarError("upstream", "Lodestar sent an unexpected answer.");
  const text = result.data.content.map((c) => c.text ?? "").join("\n").trim();
  if (result.data.isError) throw new LodestarError("tool", (text || "Lodestar refused that.").slice(0, 300));
  return { text, data: result.data.structuredContent ?? null };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
