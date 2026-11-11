import { describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "./osm";
import { OVERPASS_LIMIT, OVERPASS_MIRRORS, overpassBox } from "./overpass";

const BOX = { minLat: 37.44, minLng: -122.18, maxLat: 37.46, maxLng: -122.14 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const tap = { type: "node", id: 1, lat: 37.45, lon: -122.16, tags: { amenity: "bar", name: "Tap" } };
const host = (call: unknown[]) => new URL(String(call[0])).host;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const asFetch = (f: Fetcher) => f as unknown as typeof fetch;

describe("overpassBox", () => {
  it("moves past busy, broken and half-finished mirrors to the first good answer", async () => {
    const fetcher = vi.fn<Fetcher>(async (url) => {
      if (url.includes("overpass-api.de")) return json({}, 502);
      if (url.includes("private.coffee")) return new Response("<html>busy</html>", { status: 200 });
      if (url.includes("mail.ru")) return json({ elements: [tap], remark: "runtime error: Query timed out in \"query\"" });
      return json({ elements: [tap, { type: "node", id: 2, lat: 1, lon: 2, tags: { amenity: "bank", name: "Bank" } }] });
    });
    const result = await overpassBox(BOX, asFetch(fetcher));
    expect(result).toMatchObject({ mirror: "overpass.kumi.systems", truncated: false });
    expect(result.rows.map((r) => r.name)).toEqual(["Tap"]);
    expect(fetcher.mock.calls.map(host)).toEqual(OVERPASS_MIRRORS.map((m) => new URL(m).host));
    const init = fetcher.mock.calls[0][1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(decodeURIComponent(String(init.body))).toContain("(37.44000,-122.18000,37.46000,-122.14000)");
  });

  it("stops at the first mirror that answers", async () => {
    const fetcher = vi.fn<Fetcher>(async () => json({ elements: [] }));
    expect(await overpassBox(BOX, asFetch(fetcher))).toEqual({ rows: [], mirror: "overpass-api.de", truncated: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("treats a network error like a busy mirror, and throws a 503 when none answer", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(overpassBox(BOX, asFetch(fetcher))).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length);
  });

  it("gives up when the overall budget runs out, and caps each mirror's timeout", async () => {
    let now = 0;
    const timeouts: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn<Fetcher>(async () => {
      timeouts.push(spy.mock.calls.at(-1)![0]);
      now += 3_000; // each mirror hangs until its timeout
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(overpassBox(BOX, asFetch(fetcher), () => now)).rejects.toMatchObject({ status: 503 });
    expect(timeouts).toEqual([3_000, 3_000, 2_000]);
    spy.mockRestore();
  });

  it("flags an answer at the element limit as possibly cut short", async () => {
    const elements = Array.from({ length: OVERPASS_LIMIT }, (_, i) => ({ ...tap, id: i + 1 }));
    const result = await overpassBox(BOX, asFetch(async () => json({ elements })));
    expect(result.truncated).toBe(true);
  });
});
