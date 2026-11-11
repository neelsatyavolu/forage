# Forage

Restaurant recommendations from the places you've already eaten. Log a visit with one tap (reaction and occasion), and Forage learns your taste and recommends places near you or anywhere you travel. The AI runs on your own ChatGPT or Grok subscription. Planned for forage.xanom.co. MIT licensed.

Design: `docs/superpowers/specs/2026-11-11-forage-design.md`. Visuals follow Ledger (`~/DESIGN.md`); tokens are in `app/globals.css`.

## Run it

You need Node 20+ and pnpm.

```bash
pnpm install
printf 'FORAGE_SECRET=%s\n' "$(openssl rand -hex 32)" > .env.local
pnpm dev   # localhost:3000; the database is PGlite in .data/, reset links print to the console
```

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Configuration

| Variable | Needed | What it is |
|---|---|---|
| `FORAGE_SECRET` | always | 16+ characters. Signs session cookies and seals AI and Lodestar tokens. |
| `DATABASE_URL` | production | Postgres (Neon). Locally defaults to `pglite://.data/forage`; `pglite://memory` for a throwaway one. |
| `APP_URL` | production | The public site address, used in reset links. |
| `RESEND_API_KEY` | optional | Sends reset emails from `no-reply@n3el.dev`. Without it the link is printed. |
| `GOOGLE_PLACES_KEY` | optional | Live rating, price and hours from Google Places (New). |
| `LODESTAR_URL` | optional | Defaults to `https://lodestar.xanom.co`. |

## Layout

| Piece | Where |
|---|---|
| Shared types and zod schemas | `lib/types.ts` |
| Database client, schema, data access | `lib/db/` (`client.ts`, `schema.ts`, `places.ts`, `visits.ts`, `scores.ts`, `want.ts`, `taste.ts`, `predictions.ts`, `links.ts`) |
| Accounts (scrypt passwords, signed sessions, reset email) | `lib/account/`, `lib/mail/`, `app/api/account/` |
| AI sign-in and calls | `lib/ai/` (`complete()` in `lib/ai/index.ts`), `app/api/ai/` |
| Route helpers (`handle`, `ok`, `fail`, `readBody`, `HttpError`) | `lib/api.ts` |
| Auth and rate limits for routes | `lib/server/auth.ts` (`requireUserId`), `lib/server/limits.ts` (`allow`) |
| Place search (OSM, Google) | `lib/places/` |
| Recommendations | `lib/recs/` |
| App shell and shared UI | `app/layout.tsx`, `components/nav.tsx`, `components/ui.tsx`, `components/dialog.tsx` |
