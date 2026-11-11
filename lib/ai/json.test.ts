import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError } from "./errors";
import { completeJson, extractJson, JSON_RULE } from "./json";

const schema = z.object({ picks: z.array(z.object({ id: z.string(), reason: z.string() })).max(3) });

describe("extractJson", () => {
  it("finds the object or array inside prose and fences", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson("[1,2] done")).toEqual([1, 2]);
    expect(extractJson('{"a":[1]}')).toEqual({ a: [1] });
    expect(() => extractJson("no json")).toThrow(SyntaxError);
    expect(() => extractJson("{ broken")).toThrow();
  });
});

describe("completeJson", () => {
  const req = { system: "You pick places.", prompt: "Pick.", schema };

  it("returns validated output and tells the model to answer in JSON", async () => {
    const call = vi.fn(async () => '{"picks":[{"id":"P1","reason":"like Mian"}]}');
    expect(await completeJson(call, req)).toEqual({ picks: [{ id: "P1", reason: "like Mian" }] });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]).toEqual([`You pick places.\n\n${JSON_RULE}`, "Pick."]);
  });

  it("retries once with the problem stated", async () => {
    const call = vi.fn<(s: string, p: string) => Promise<string>>().mockResolvedValueOnce('{"picks":[{"id":1}]}').mockResolvedValueOnce('{"picks":[]}');
    expect(await completeJson(call, req)).toEqual({ picks: [] });
    expect(call.mock.calls[1][1]).toMatch(/could not be used because picks\.0\.id/);
  });

  it("gives up after a second bad answer", async () => {
    const call = vi.fn(async () => "I can't do that");
    const error = await completeJson(call, req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe("bad_output");
    expect((error as AiError).status).toBe(502);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("lets a failed model call through", async () => {
    await expect(completeJson(async () => Promise.reject(new Error("down")), req)).rejects.toThrow("down");
  });
});
