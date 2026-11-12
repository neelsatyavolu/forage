# Forage

**Planned for forage.xanom.co** · MIT licensed

Restaurant recommendations from the places you've already eaten. Log a visit with one tap on a reaction (loved, fine, didn't like) and an occasion (quick bite, casual, night out, special), answer at most two "which did you like more?" questions, and Forage keeps a 0–10 score for every place within each occasion. From those visits it builds a taste profile and ranks real places near you, anywhere you travel, or from a sentence you type. AI runs on your own ChatGPT or Grok subscription; without it, everything except Ask still works on the plain scoring. Forage can also link to your Lodestar account to see your trips and add a pick to a trip day.

Tabs: **Near me** (picks around you, "Something new" or "Go-to", with Ask at the top), **Explore** (any city, neighborhood or Lodestar trip, in Travel, Splurge or Stretch mode), **Lists** (Been and Want to try, with a map) and **You** (account, taste, appearance, AI, Lodestar). **+ Rate** in the top bar rates one place from anywhere. On phones the tabs sit in a bottom bar.

No account is needed to start. A new visitor (and anyone with fewer than 10 rated places who hasn't closed it) lands on `/rate`: tap every nearby place you've been to, one tap each for how it was, at most one "which did you like more?" each, and a score out of 10 right away. The first write makes a guest user; saving later (after 5 ratings, or in You) turns that same user into an account. Picks start at 5 rated places. Every step can be undone (U or Cmd/Ctrl+Z) and closed without losing anything.

Design: `docs/superpowers/specs/2026-11-11-forage-design.md`. Visuals follow Ledger (`~/DESIGN.md`); tokens are in `app/globals.css`.

## Run it

You need Node 20+ and pnpm.

```bash
pnpm install
printf 'FORAGE_SECRET=%s\n' "$(openssl rand -hex 32)" > .env.local
pnpm dev   # localhost:3000; the database is PGlite in .data/, reset links print to the console
```

`pnpm dev` and `pnpm build` first copy MapLibre's worker into `public/` (`scripts/copy-maplibre-worker.mjs`).

## Configuration

| Variable | Needed | What it is |
|---|---|---|
| `FORAGE_SECRET` | always | 16+ characters. Signs session cookies and seals AI and Lodestar tokens. |
| `DATABASE_URL` | production | Postgres (Neon). Locally defaults to `pglite://.data/forage`; `pglite://memory` for a throwaway one. |
| `APP_URL` | production | The public site address. Used in reset links and as the base of the Lodestar client id and redirect URI. |
| `RESEND_API_KEY` | optional | Sends reset emails from `no-reply@n3el.dev`. Without it the link is printed. |
| `GOOGLE_PLACES_KEY` | optional, unset in production | A server key for Places API (New). Only used when someone opens one place's details, to add live rating, price, hours and a Maps link. Production runs without it so Forage costs nothing per request; recommendations and nearby search never call Google. |
| `LODESTAR_URL` | optional | Defaults to `https://lodestar.xanom.co`. |

## How it works

| Piece | Where | What it does |
|---|---|---|
| Places | `lib/places`, `app/api/places/*` | Free sources only. OpenStreetMap is the stored catalog: Photon for text search, Overpass for nearby (up to 5 km). Nearby searches snap to a fixed grid of 0.02° tiles (about 2 km); a tile's places are stored in `places` and its fetch time in `osm_tiles`, and it's fetched again only after 14 days, so most searches never leave the database. For missing or stale tiles, a request gives Overpass one quick try (2.5 s, the first mirror not skipped). If that misses, the request is answered right away from the stale tiles, or for an area never fetched from Photon's reverse lookup (up to 50 restaurants, cafes, bars, pubs and fast food places), and the tiles are refilled in the background after the response (`waitUntil`, 45 s across overpass-api.de, overpass.private.coffee, maps.mail.ru and overpass.kumi.systems, up to 30 s each). A refill first claims its tiles in `osm_tiles`, so two instances don't refill the same tiles within a minute, and a process never runs two refills of one tile. If the whole box comes back cut short at 3,000 elements, the refill fetches each tile on its own so each can be marked. A mirror that fails is skipped for 2 minutes in that process. Routes that run nearby search set `maxDuration = 60` so the refill can finish. All requests send User-Agent `Forage/1.0 (+https://forage.xanom.co)`. A Photon result never wipes the cuisine, hours or website that Overpass already saved. With `GOOGLE_PLACES_KEY`, opening a place's details matches it to Google once (rejected if more than 250 m away); only the Google place id is stored, and rating, price and hours are fetched each time, per Google's terms. |
| Logging and scores | `lib/scoring`, `app/api/visits`, `app/api/comparisons` | Each place starts at its reaction band (loved 8.5, fine 6, didn't like 3.5). Comparisons are only against places in the same occasion and the same band, closest score first, at most two per visit. A Bradley-Terry model is refit on every write and mapped to 0–10, inside a database transaction. Editing or deleting a visit refits both occasions. |
| Taste profile | `lib/taste` | Every place gets tags from one vocabulary: cuisine, dish, price, occasion, vibe, attributes and amenities, from OSM data, the user's own dishes and words in their notes. Each visit adds how much the user liked the place (its fitted score, else its reaction), centred on that user's average, to every tag on it. Visits lose half their weight after a year. With AI connected, "Update from my places" writes tag cards for logged places (from public facts only, since places are shared between users) and a plain-English taste summary the user can edit; an edited summary is never overwritten. |
| Recommendations | `lib/recs`, `app/api/recs`, `app/api/explore/recs` | Candidates are real nearby places. Fast scoring mixes taste match, crowd quality, distance and novelty; crowd quality is neutral for every place because no free rating source exists (recommendations make no Google calls); the mode changes the mix. Travel weighs crowd rating more, Splurge boosts pricier and special-occasion places and ignores price dislikes, Stretch only shows cuisines you haven't logged, ranked by closeness to ones you like. With AI connected, the top 30 go to the model as short ids (`c1`…`c30`) with compact facts, your taste summary and your own places; it answers with ids and one line each that cites one of your places. Unknown or repeated ids are dropped, so it can't invent a restaurant. Any AI error falls back to the fast ranking. |
| Ask | `app/api/recs/ask`, `components/recs/ask-panel.tsx` | A sentence ("spicy, under $30, two people") and your location give three picks with reasons. Needs ChatGPT or Grok connected. |
| Feedback | `lib/taste/feedback.ts`, `app/api/feedback` | Each recommendation call stores a prediction for the first 10 new places shown. When you later log one, the place shows "We predicted 8.4, you gave 7.1", and the average miss becomes a per-user offset (shrunk toward 0 with few samples, capped at ±2) on future predictions. |
| Lists and map | `components/lists`, `components/map`, `app/api/want` | Been ranked by score with occasion filters, Want to try, and a MapLibre map on OpenFreeMap tiles (free, no key). |
| Lodestar link | `lib/lodestar`, `app/oauth/*`, `app/api/lodestar/*` | See below. |
| Accounts | `lib/account`, `lib/db`, `app/api/account` | Email and password (scrypt), signed session cookies that a password reset or "sign out everywhere" revokes, reset links by email through Resend. Postgres in production, PGlite locally. Rate limits are counted in the database (`lib/server/limits.ts`). |
| AI sign-in | `lib/ai` | ChatGPT or Grok OAuth through `@neelsatyavolu/shared-ai-auth`, the same as Lodestar. Tokens are AES-GCM sealed and bound to their owner. There is no server AI key. |

## Lodestar link

Forage has its own accounts. "Connect Lodestar" on the Account page links one Forage account to one Lodestar account:

- Forage is an OAuth public client of Lodestar, identified by a Client ID Metadata Document at `APP_URL/oauth/client-metadata.json`. The redirect URI is `APP_URL/oauth/lodestar/callback`.
- `POST /api/lodestar/connect` makes a PKCE S256 verifier and state, keeps them in a 10-minute encrypted cookie tied to the signed-in user, and returns Lodestar's consent URL (scope `trips`, resource Lodestar's `/api/mcp`). The callback checks state and issuer, exchanges the code and stores the tokens sealed in `lodestar_links`. It never signs anyone in.
- Forage calls Lodestar's MCP endpoint over Streamable HTTP with tools `list_trips`, `get_trip`, `add_items` and `get_preferences`. Tokens refresh a minute before they expire. Lodestar rotates refresh tokens and revokes the link if one is reused, so the refresh locks the row first.
- In Explore your trips appear with their destination and dates, and "Add to trip" adds a pick to a day. The restaurant details sent come from Forage's database, not the request.
- Connecting (and "Import from Lodestar" on the Account page) calls `get_preferences` and stores the result in `taste_seeds`. Liked cuisines become taste weights of 0.4, but only where the user's own visits have no weight for that cuisine or a weaker positive one; a cuisine their visits rate higher, or negatively, keeps the visit-derived weight. Dietary needs (vegetarian, vegan, gluten-free, halal, kosher, lactose-free, pescetarian) hide new places that OpenStreetMap marks as not serving them, in every mode. The dining budget ($ to $$$$) is a price ceiling for Near me only; Splurge and the other modes ignore it. Places you've been to are never hidden. A failed import doesn't stop the link.
- Disconnect deletes Forage's copy of the tokens and the imported preferences. Lodestar has no revoke endpoint, so also remove Forage in Lodestar's settings.

Lodestar refuses a client id on `http://localhost`, an IP address or a single-word host, so linking only works when `APP_URL` is a public https address (a tunnel works for development).

## Tests

```bash
pnpm test             # unit tests (vitest), including PGlite database tests
pnpm test:coverage
pnpm typecheck && pnpm lint
pnpm build
```

`lib/recs/eval.test.ts` is an offline check of the ranking: 40 synthetic users each log 60 visits in a 240-place city, 20% of their loved places are held out, and at least 90% of held-out places must land in the top third.

## Limits

- Overpass mirrors are often busy. Until a background refill gets through, a new area shows at most 50 places from Photon, without cuisine or hours.
- A tile that is still cut short on its own isn't marked as fetched, so it's tried again on a later search.
- There are no crowd ratings, so the crowd-quality part of the score is neutral.
- Ranking weights, the one-year half-life and the calibration limits were tuned on synthetic data only.
- AI tag cards are written only for places you have logged; nearby candidates rely on OSM cuisine, price and attributes until the rerank.
- There is no way to add a place OpenStreetMap doesn't have.
- Places rated in `/rate` are dated the day they were rated (shown as "Rated Nov 11"), unless a date is added under Add details.
- Near me shows "Near you", not the neighborhood name; there's no reverse geocoding yet.
- Dietary needs only hide places whose OpenStreetMap data says `diet:<need>=no`; most places don't say either way, so they still show.
- The dining budget only hides places with a known price, which OpenStreetMap rarely has.
- The Lodestar link has only been tested against fake responses, not the live Lodestar.
- Map pins don't cluster.

## Credits

- Place data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), searched through [Photon](https://photon.komoot.io) and the public Overpass servers ([overpass-api.de](https://overpass-api.de), [private.coffee](https://overpass.private.coffee), [VK Maps](https://maps.mail.ru/osm/tools/overpass/), [Kumi Systems](https://overpass.kumi.systems)). Forage stores the places it fetches, as ODbL allows, and keeps this attribution.
- Map tiles from [OpenFreeMap](https://openfreemap.org), drawn with [MapLibre GL JS](https://maplibre.org).

## License

[MIT](LICENSE)
