import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "./osm";
import { BREAK_MS, OVERPASS_LIMIT, OVERPASS_MIRRORS, overpassBox, resetOverpassBreaker, type OverpassOptions } from "./overpass";

const BOX = { minLat: 37.44, minLng: -122.18, maxLat: 37.46, maxLng: -122.14 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const tap = { type: "node", id: 1, lat: 37.45, lon: -122.16, tags: { amenity: "bar", name: "Tap" } };
const host = (call: unknown[]) => new URL(String(call[0])).host;
const hosts = OVERPASS_MIRRORS.map((m) => new URL(m).host);
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const LONG: Omit<OverpassOptions, "fetcher"> = { budgetMs: 8_000, perMirrorMs: 3_000 };
const opts = (f: Fetcher, extra: Partial<OverpassOptions> = {}): OverpassOptions => ({ ...LONG, fetcher: f as unknown as typeof fetch, ...extra });
const timeout = () => {
  throw new DOMException("timed out", "TimeoutError");
};

afterEach(() => {
  resetOverpassBreaker();
  vi.useRealTimers();
});

describe("overpassBox", () => {
  it("moves past busy, broken and half-finished mirrors to the first good answer", async () => {
    const fetcher = vi.fn<Fetcher>(async (url) => {
      if (url.includes("overpass-api.de")) return json({}, 502);
      if (url.includes("private.coffee")) return new Response("<html>busy</html>", { status: 200 });
      if (url.includes("mail.ru")) return json({ elements: [tap], remark: "runtime error: Query timed out in \"query\"" });
      return json({ elements: [tap, { type: "node", id: 2, lat: 1, lon: 2, tags: { amenity: "bank", name: "Bank" } }] });
    });
    const result = await overpassBox(BOX, opts(fetcher));
    expect(result).toMatchObject({ mirror: "overpass.kumi.systems", truncated: false });
    expect(result.rows.map((r) => r.name)).toEqual(["Tap"]);
    expect(fetcher.mock.calls.map(host)).toEqual(hosts);
    const init = fetcher.mock.calls[0][1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(decodeURIComponent(String(init.body))).toContain("(37.44000,-122.18000,37.46000,-122.14000)");
  });

  it("stops at the first mirror that answers", async () => {
    const fetcher = vi.fn<Fetcher>(async () => json({ elements: [] }));
    expect(await overpassBox(BOX, opts(fetcher))).toEqual({ rows: [], mirror: "overpass-api.de", truncated: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("treats a network error like a busy mirror, and throws a 503 when none answer", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(overpassBox(BOX, opts(fetcher))).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length);
  });

  it("gives up when the overall budget runs out, and caps each mirror's timeout", async () => {
    let now = 0;
    const timeouts: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn<Fetcher>(async () => {
      timeouts.push(spy.mock.calls.at(-1)![0]);
      now += 3_000; // each mirror hangs until its timeout
      return timeout();
    });
    await expect(overpassBox(BOX, opts(fetcher, { clock: () => now }))).rejects.toMatchObject({ status: 503 });
    expect(timeouts).toEqual([3_000, 3_000, 2_000]);
    spy.mockRestore();
  });

  it("tries only as many mirrors as allowed", async () => {
    const fetcher = vi.fn<Fetcher>(async () => json({}, 502));
    await expect(overpassBox(BOX, opts(fetcher, { maxMirrors: 1 }))).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("flags an answer at the element limit as possibly cut short", async () => {
    const elements = Array.from({ length: OVERPASS_LIMIT }, (_, i) => ({ ...tap, id: i + 1 }));
    const result = await overpassBox(BOX, opts(async () => json({ elements })));
    expect(result.truncated).toBe(true);
  });
});

describe("circuit breaker", () => {
  it("skips a failed mirror for two minutes, then tries it again", async () => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    const fetcher = vi.fn<Fetcher>(async (url) => (url.includes("overpass-api.de") ? json({}, 502) : json({ elements: [] })));
    expect((await overpassBox(BOX, opts(fetcher))).mirror).toBe("overpass.private.coffee");
    expect((await overpassBox(BOX, opts(fetcher))).mirror).toBe("overpass.private.coffee");
    expect(fetcher.mock.calls.map(host)).toEqual(["overpass-api.de", "overpass.private.coffee", "overpass.private.coffee"]);

    vi.setSystemTime(BREAK_MS - 1);
    await overpassBox(BOX, opts(fetcher));
    expect(fetcher.mock.calls.at(-1)!.map(String)[0]).toContain("private.coffee");
    vi.setSystemTime(BREAK_MS + 1);
    await overpassBox(BOX, opts(fetcher));
    expect(host(fetcher.mock.calls.at(-2)!)).toBe("overpass-api.de");
  });

  it("with one mirror allowed, uses the first one not skipped", async () => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    const fetcher = vi.fn<Fetcher>(async (url) => (url.includes("overpass-api.de") ? json({}, 502) : json({ elements: [] })));
    await expect(overpassBox(BOX, opts(fetcher, { maxMirrors: 1 }))).rejects.toMatchObject({ status: 503 });
    expect((await overpassBox(BOX, opts(fetcher, { maxMirrors: 1 }))).mirror).toBe("overpass.private.coffee");
  });

  it("a short request-path timeout doesn't trip the breaker unless asked to", async () => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    const slow = vi.fn<Fetcher>(async () => timeout());
    await expect(overpassBox(BOX, opts(slow, { maxMirrors: 1 }))).rejects.toMatchObject({ status: 503 });
    await expect(overpassBox(BOX, opts(slow, { maxMirrors: 1 }))).rejects.toMatchObject({ status: 503 });
    expect(slow.mock.calls.map(host)).toEqual(["overpass-api.de", "overpass-api.de"]);

    await expect(overpassBox(BOX, opts(slow, { maxMirrors: 1, breakOnTimeout: true }))).rejects.toMatchObject({ status: 503 });
    await expect(overpassBox(BOX, opts(slow, { maxMirrors: 1 }))).rejects.toMatchObject({ status: 503 });
    expect(host(slow.mock.calls.at(-1)!)).toBe("overpass.private.coffee");
  });

  it("throws at once when every mirror is skipped", async () => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    const down = vi.fn<Fetcher>(async () => json({}, 503));
    await expect(overpassBox(BOX, opts(down))).rejects.toMatchObject({ status: 503 });
    await expect(overpassBox(BOX, opts(down))).rejects.toMatchObject({ status: 503 });
    expect(down).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length);
  });
});
