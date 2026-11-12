import type { Db } from "../lib/db/client";

// Helpers for route tests: a cookie jar standing in for next/headers, and
// requests that carry it. Each test file mocks next/headers, the database and
// network-bound modules itself (vi.mock is per file), using these.

export type Jar = Map<string, string>;

export function cookieStore(jar: Jar) {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: string | { name: string }) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  };
}

export const state: { jar: Jar; db: Db | null } = { jar: new Map(), db: null };

const BASE = "http://localhost:3000";

export function request(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
    body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
  });
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function call<T>(res: Response | Promise<Response>): Promise<{ status: number; body: Envelope<T> }> {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Envelope<T> };
}

/** The data of a successful answer; fails the test with the error otherwise. */
export async function data<T>(res: Response | Promise<Response>): Promise<T> {
  const { status, body } = await call<T>(res);
  if (!body.ok) throw new Error(`HTTP ${status}: ${body.error}`);
  return body.data;
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
