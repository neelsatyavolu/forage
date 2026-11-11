// Test helper: a fetch that answers from a script and records what was asked.

export type Call = { url: string; init: RequestInit };

export function fakeFetch(answer: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return answer(url, init, calls.length);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const sse = (body: unknown) => new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });

/** A JSON-RPC tools/call answer for the request in `init`. */
export function toolAnswer(init: RequestInit, structuredContent: unknown, opts: { isError?: boolean; text?: string } = {}) {
  const { id } = JSON.parse(String(init.body)) as { id: number };
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: opts.text ?? "ok" }], structuredContent, isError: opts.isError } };
}
