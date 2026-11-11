import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { getLodestarLink } from "../db/links";
import { deriveKey } from "../ai/seal";
import { freshDb, USER_A, USER_B } from "../../test/db";
import { lodestarClient } from "./client";
import { LodestarError } from "./errors";
import { fakeFetch, json, sse, toolAnswer } from "./fake";
import { fromEventStream } from "./mcp";
import { dbTokenSource, openTokens, saveTokens, sealTokens } from "./store";
import type { Tokens } from "./tokens";

const MCP = "https://lodestar.example/api/mcp";
const key = deriveKey("a-test-secret-of-length", "lodestar-tokens");
const TRIP = "11111111-1111-4111-8111-111111111111";
const trip = { id: TRIP, title: "Tokyo", destination: "Tokyo", startDate: "2026-12-01", endDate: "2026-12-03" };
const NOW = 1_000_000;
const good: Tokens = { accessToken: "lsa_1", refreshToken: "lsr_1", expiresAt: NOW + 3600_000 };

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).authorization;

function setup(answer: Parameters<typeof fakeFetch>[0], refresher = async (): Promise<Tokens> => ({ accessToken: "lsa_2", refreshToken: "lsr_2", expiresAt: NOW + 7200_000 })) {
  const f = fakeFetch(answer);
  let refreshes = 0;
  const tokens = dbTokenSource(db, key, USER_A, async (rt) => {
    refreshes++;
    expect(rt).toBe("lsr_1");
    return refresher();
  }, () => NOW);
  return { f, client: lodestarClient({ fetch: f.fetch, mcpUrl: MCP, tokens, now: () => NOW }), refreshes: () => refreshes };
}

describe("token store", () => {
  it("seals tokens to the account", () => {
    const sealed = sealTokens(key, USER_A, good);
    expect(sealed).not.toContain("lsa_1");
    expect(openTokens(key, USER_A, sealed)).toEqual(good);
    expect(openTokens(key, USER_B, sealed)).toBeNull();
  });

  it("refuses when the account isn't linked", async () => {
    const { client } = setup(() => json({}));
    await expect(client.listTrips()).rejects.toMatchObject({ code: "not_linked" });
  });
});

describe("lodestar client", () => {
  beforeEach(async () => {
    await saveTokens(db, key, USER_A, good, "lodestar.example", NOW);
  });

  it("calls list_trips over JSON-RPC with the bearer token", async () => {
    const { f, client } = setup((_u, init) => json(toolAnswer(init, { trips: [{ ...trip, travelers: 2, items: 3 }] })));
    expect(await client.listTrips()).toEqual([trip]);
    const body = JSON.parse(String(f.calls[0].init.body));
    expect(body).toMatchObject({ jsonrpc: "2.0", method: "tools/call", params: { name: "list_trips", arguments: {} } });
    expect(bearer(f.calls[0].init)).toBe("Bearer lsa_1");
    expect((f.calls[0].init.headers as Record<string, string>).accept).toContain("text/event-stream");
  });

  it("reads an answer sent as an event stream", async () => {
    const items = [{ id: "i1", kind: "dining", status: "planned", title: "Sushi", startDate: "2026-12-01", startTime: "19:00", extra: 1 }];
    const { client } = setup((_u, init) => sse(toolAnswer(init, { trip: { ...trip, items, tasks: [] } })));
    expect(await client.getTrip(TRIP)).toEqual({ ...trip, items: [{ id: "i1", kind: "dining", status: "planned", title: "Sushi", startDate: "2026-12-01", startTime: "19:00" }] });
  });

  it("refreshes once on 401, saves the new pair and retries", async () => {
    const { f, client, refreshes } = setup((_u, init, n) => (n === 1 ? new Response("", { status: 401 }) : json(toolAnswer(init, { itemIds: ["new"] }))));
    expect(await client.addItems(TRIP, [{ kind: "dining" }])).toEqual(["new"]);
    expect(refreshes()).toBe(1);
    expect(bearer(f.calls[1].init)).toBe("Bearer lsa_2");
    const link = await getLodestarLink(db, USER_A);
    expect(openTokens(key, USER_A, link!.sealedTokens)).toMatchObject({ accessToken: "lsa_2", refreshToken: "lsr_2" });
    expect(link!.lodestarUserLabel).toBe("lodestar.example");
  });

  it("gives up after a second 401", async () => {
    const { f, client, refreshes } = setup(() => new Response("", { status: 401 }));
    await expect(client.listTrips()).rejects.toMatchObject({ code: "unauthorized" });
    expect(f.calls).toHaveLength(2);
    expect(refreshes()).toBe(1);
  });

  it("refreshes an expired token before calling", async () => {
    await saveTokens(db, key, USER_A, { ...good, expiresAt: NOW }, null, NOW);
    const { f, client, refreshes } = setup((_u, init) => json(toolAnswer(init, { trips: [] })));
    await client.listTrips();
    expect(refreshes()).toBe(1);
    expect(f.calls).toHaveLength(1);
    expect(bearer(f.calls[0].init)).toBe("Bearer lsa_2");
  });

  it("uses tokens another request already refreshed instead of spending the old refresh token", async () => {
    // This request read lsr_1 before its 401; meanwhile another request saved a new pair.
    await saveTokens(db, key, USER_A, { accessToken: "lsa_3", refreshToken: "lsr_3", expiresAt: NOW + 1 }, null, NOW);
    const source = dbTokenSource(db, key, USER_A, async () => {
      throw new Error("must not refresh");
    }, () => NOW);
    expect(await source.refresh(good)).toMatchObject({ accessToken: "lsa_3" });
  });

  it("removes the link when Lodestar revoked the grant", async () => {
    const { client } = setup(() => new Response("", { status: 401 }), async () => {
      throw new LodestarError("revoked", "gone");
    });
    await expect(client.listTrips()).rejects.toMatchObject({ code: "revoked" });
    expect(await getLodestarLink(db, USER_A)).toBeNull();
  });

  it("passes a tool's refusal on as its message", async () => {
    const { client } = setup((_u, init) => json(toolAnswer(init, null, { isError: true, text: "That trip doesn't exist." })));
    await expect(client.getTrip(TRIP)).rejects.toMatchObject({ code: "tool", message: "That trip doesn't exist." });
  });

  it("treats malformed answers as upstream errors", async () => {
    const { client } = setup((_u, init) => json(toolAnswer(init, { trips: "nope" })));
    await expect(client.listTrips()).rejects.toMatchObject({ code: "upstream" });
    const other = setup(() => json({ jsonrpc: "2.0", id: 999, result: {} }));
    await expect(other.client.listTrips()).rejects.toMatchObject({ code: "upstream" });
    const down = setup(() => new Response("", { status: 503 }));
    await expect(down.client.listTrips()).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("fromEventStream", () => {
  it("finds the response with the request's id among other events", () => {
    const body = ": keep-alive\n\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"note\"}\n\ndata: not json\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{}}\n\n";
    expect(fromEventStream(body, 7)).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
    expect(fromEventStream(body, 8)).toBeNull();
  });
});
