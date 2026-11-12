import { mkdirSync } from "node:fs";
import type { Queryable } from "../../lib/db/client";
import { migrate } from "../../lib/db/schema";

// The import's own connection. lib/db/client is server-only (it reads the
// app's env and attaches to Vercel's pool), so this opens the same two kinds
// of database directly: pglite://<dir> locally, a Postgres URL (Neon) in CI.

export type ImportDb = Queryable & { close(): Promise<void> };

const PGLITE = "pglite://";
export const MB = 1024 * 1024;

export async function openDb(url: string): Promise<ImportDb> {
  let db: ImportDb;
  if (url.startsWith(PGLITE)) {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = url.slice(PGLITE.length);
    if (dir !== "memory") mkdirSync(dir, { recursive: true });
    const pg = dir === "memory" ? new PGlite() : new PGlite(dir);
    db = { query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows, close: () => pg.close() };
  } else {
    const { Pool } = await import("pg");
    // Same as lib/db/client: naming verify-full keeps full certificate checks without pg's sslmode warning.
    const connectionString = url.replace(/([?&]sslmode=)(?:require|prefer|verify-ca)(?=&|$)/, "$1verify-full");
    const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 30_000 });
    pool.on("error", (error) => console.error("[osm-import] idle database connection lost:", error.message));
    db = { query: async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[], close: () => pool.end() };
  }
  await migrate(db);
  return db;
}

/** The whole database's size on disk, in bytes (what Neon's storage limit counts). */
export async function dbSize(q: Queryable): Promise<number> {
  const [row] = await q.query<{ bytes: string | number }>("SELECT pg_database_size(current_database()) AS bytes");
  return Number(row.bytes);
}

/** The places table with its indexes and TOAST, in bytes. */
export async function placesSize(q: Queryable): Promise<number> {
  const [row] = await q.query<{ bytes: string | number }>("SELECT pg_total_relation_size('places') AS bytes");
  return Number(row.bytes);
}
