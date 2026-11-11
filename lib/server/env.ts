import "server-only";
import { z } from "zod";

// Server configuration, checked once. Outside production the database falls
// back to an on-disk PGlite and the site address to localhost, so local
// development needs no services.

const schema = z.object({
  FORAGE_SECRET: z.string().min(16, "FORAGE_SECRET must be at least 16 characters"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  // Google Places (New). Without it places come from OpenStreetMap only, with no live rating, price or hours.
  GOOGLE_PLACES_KEY: z.string().min(20).optional(),
  // Lodestar's site, for the account link (OAuth + MCP).
  LODESTAR_URL: z.url(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const production = process.env.NODE_ENV === "production";
  const parsed = schema.safeParse({
    FORAGE_SECRET: process.env.FORAGE_SECRET,
    DATABASE_URL: process.env.DATABASE_URL ?? (production ? undefined : "pglite://.data/forage"),
    APP_URL: process.env.APP_URL ?? (production ? undefined : "http://localhost:3000"),
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    GOOGLE_PLACES_KEY: process.env.GOOGLE_PLACES_KEY || undefined,
    LODESTAR_URL: process.env.LODESTAR_URL || "https://lodestar.xanom.co",
  });
  if (!parsed.success) throw new Error(`Server misconfigured: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  cached = parsed.data;
  return cached;
}
