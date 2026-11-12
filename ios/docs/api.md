# Forage API contract for the iOS app

Every route the iOS app calls, taken from the route handlers in `app/api/**/route.ts` and the zod
schemas in `lib/types.ts`, `lib/account/input.ts`, `lib/lodestar/trips.ts` and
`components/lists/types.ts` (as of 2026-11-11, including the rating flow). When the web changes, the handler wins over this
file: re-read it and update this contract.

Base URL: `https://forage.xanom.co` in production (planned), `http://localhost:3000` for `pnpm dev`.

## 0. Rules that apply to every route

### Envelope

Every JSON route answers with one of:

```json
{ "ok": true,  "data": <T> }
{ "ok": false, "error": "A sentence that is safe to show the user." }
```

The web client (`lib/client.ts`) treats "not 2xx, or `ok` is not true" as an error, shows `error`,
or "Request failed (HTTP n)." when the body is not the envelope, and "Can't reach Forage. Check your
connection." when the request never got an answer. iOS does the same (copy Lodestar's
`ResponseDecoder`). Routes that answer `{}` decode as `EmptyResponse`.

Errors every route can give (from `handle()` in `lib/api.ts`):

| Case | Status | Message |
|---|---|---|
| Body isn't JSON | 400 | "Request body is not JSON." |
| Body over the route's byte cap (32,000 unless noted) | 413 | "Request is too large." |
| Body fails the zod schema (routes using `readBody`) | 400 | the first zod issue's message, often zod's own text (for example "Invalid input"), else "Invalid request." |
| Non-GET with a foreign `Origin` header | 403 | "Cross-site request refused." |
| Not signed in (routes marked **Auth: session**) | 401 | "Sign in first." |
| Anything unexpected | 500 | "The `<what>` failed. Try again." (`<what>` per route, given below) |

**Bodies.** Every non-GET route that reads a body calls `JSON.parse` on it, so an empty body is a
400. Routes that don't read a body ignore it. Like Lodestar, iOS sends `{}` on every non-GET call
that has no body, with `Content-Type: application/json`.

**Origin.** `URLSession` sends no `Origin` header, so the same-origin check passes. Don't add one.

### Auth: the session cookie

- `POST /api/account/login`, `/register` and `/reset` set `fg_session` (HttpOnly, SameSite=Lax,
  Secure in production, path `/`, 30 days). Format `userId.expiresAt.version.signature`; never parse it.
- Every route marked **Auth: session** reads it. A password reset or "sign out everywhere" bumps the
  account's session version, which ends every other session: the next call answers 401 "Sign in first.".
- AI routes also use `fg_device` (path `/api/ai`, 1 year), `{codex|grok}_pkce` (path `/api/ai`,
  10 minutes) and `{codex|grok}_s_0…5` (sealed tokens, path `/api/ai`, 30 days, signed out only).
- Connect Lodestar uses `fg_lodestar_flow` (path `/oauth/lodestar/callback`, 10 minutes).
- Use one `URLSession` with `HTTPCookieStorage.shared` and `httpShouldSetCookies = true` (Lodestar's
  `APIClient`), so all of these flow with no app code. Cookies are path-scoped: the AI and Lodestar
  flow cookies are only sent to their own paths, which the storage handles.

**Which 401 means "signed out".** Several routes answer 401 for other reasons:

| 401 message | Meaning | iOS response |
|---|---|---|
| "Sign in first." | no or dead session | drop to signed out (`AppState.handle`) |
| "That email and password don't match an account." | login | show inline |
| "That password isn't right." | delete account | show inline |
| "Connect your ChatGPT or Grok account first." / "Connect your ChatGPT account first." / "Connect your Grok account first." / "Connect ChatGPT or Grok on the Account page to use Ask." | AI not connected, or its token could not be refreshed | show, offer Connect AI |

Only "Sign in first." signs the user out. Match it exactly (`APIError.isSignInRequired`); treat every
other 401 as a normal error. `APIError.needsAIConnection` is any 401 whose message starts with "Connect".

### Rate limits

Two limiters exist. On 429 show the message, re-enable the control, never retry automatically.

1. **Database limiter** (`lib/server/limits.ts`): fixed windows counted in Postgres, shared by all
   server instances. Keyed per account (`userId`) unless noted; auth routes key on a keyed hash of the
   client IP.

| Name | Allowed | Window | Used by |
|---|---|---|---|
| `login` | 10 | 15 min, per IP | login |
| `register` | 5 | 60 min, per IP | register |
| `forgot` | 5 | 15 min, per IP | forgot |
| `forgotEmail` | 3 | 60 min, per email | forgot (silently skips the email) |
| `forgotSentDaily` | 40 | 24 h, global | forgot (silently skips the email) |
| `reset` | 10 | 15 min, per IP | reset |
| `writes` | 300 | 15 min | visits POST/PATCH/DELETE, comparisons, want POST/DELETE, taste PUT, taste refresh |
| `ai` | 40 | 15 min, per AI owner | every AI model call (recs rerank, Ask, taste refresh) |
| `places` | 300 | 15 min | places search/nearby (per IP with no session), rating deck (signed in or guest), place details' live part, geocode (per IP) |
| `placesDaily` | 3000 | 24 h | places search/nearby (per IP with no session), rating deck (signed in or guest), geocode (per IP) |
| `recs` | 120 | 15 min | recs, explore recs, Ask |
| `lodestar` | 60 | 15 min | every Lodestar call, connect, the callback |
| `guest` | 10 | 60 min, per IP | `POST /api/account/guest` when it creates a guest |
| `deckAnon` | 60 | 15 min, per IP | `POST /api/rate/deck` with no session |

2. **In-memory limiter** (`rateLimited` in `lib/api.ts`): per client IP per route, 60-second window,
   per server instance, so approximate. Used only by `ai-start` and `ai-complete` (10 per minute each).
   Message: "Too many requests. Wait a minute and try again."

Users behind carrier NAT share an IP, which matters for the per-IP limits.

### Timeouts

No route sets `maxDuration`, so Vercel's default applies. Upstream calls inside the server: Overpass
and Photon have short timeouts with a second mirror, Google 1 call, the model call 45 s to connect,
Lodestar MCP 15 s. Client `timeoutIntervalForRequest`:

- `standard` 30 s: account, visits, comparisons, want, taste GET/PUT, feedback, Lodestar status.
- `places` 45 s: `/api/places`, `/api/places/:id`, `/api/explore/geocode` (Overpass may try two mirrors).
- `recs` 90 s: `/api/recs`, `/api/explore/recs`, Lodestar trips/add (nearby lookup plus an AI rerank).
- `ai` 150 s: `/api/recs/ask`, `/api/taste/refresh`, `/api/ai/*/complete`.

### Value formats

- **Ids** are UUID strings (`places.id`, `visits.id`, `userId`, Lodestar trip ids). Comparison ids
  and prediction ids are integers.
- **Days** are `"YYYY-MM-DD"` strings (`visitedOn`, trip dates). Keep them as a `LocalDate` value,
  never `Date`. `visitedOn` is the device's local calendar day.
- **Timestamps** (`createdAt`, `updatedAt`, `addedAt`, `connectedAt`, `at`) are epoch milliseconds
  (`Int64`, `EpochMillis` in Lodestar's models).
- **Scores** are `Double` in 0…10. The web shows one decimal (`8.4`) in mono with tabular figures.
- **Enums** (decode leniently, unknown → `.unknown`):
  - `Reaction`: `loved | fine | disliked` (labels "Loved", "Fine", "Didn't like").
  - `Occasion`: `quick | casual | night_out | special` (labels "Quick bite", "Casual", "Night out", "Special").
  - `PlaceSource`: `osm | manual`.
  - `WantSource`: `manual | rec | ask | import | lodestar`.
  - `RecMode`: `near | travel | splurge | stretch`.
  - AI `Provider`: `codex | grok` (labels "ChatGPT", "Grok").
- **Coordinates**: `lat` −90…90, `lng` −180…180, `Double`.

---

## 1. Shared models

### 1.1 `Place`

```ts
Place {
  id: string                 // UUID, stable Forage id; visits, lists and recs reference it
  source: "osm" | "manual"
  sourceId: string           // e.g. "node/123456" for OSM
  googlePlaceId: string | null
  name: string
  lat: number
  lng: number
  address: string | null
  city: string | null
  country: string | null
  cuisine: string[]          // lowercase OSM-style values, e.g. ["ramen", "japanese"]
  priceLevel: 1|2|3|4 | null // show as "$"…"$$$$"
  tags: PlaceTags
  updatedAt: number          // epoch ms
}

PlaceTags {                  // loose: unknown keys may appear; decode only these, ignore the rest
  dishes?: string[]
  vibe?: string[]
  attributes?: string[]
  occasions?: Occasion[]
  openingHours?: string      // raw OSM opening_hours text
  website?: string
  phone?: string
  description?: string
}
```

### 1.2 `Visit`

```ts
Visit {
  id: string                 // UUID
  userId: string
  placeId: string
  visitedOn: string          // "YYYY-MM-DD"
  reaction: Reaction
  occasion: Occasion
  rating: number | null      // the user's own score, whole 1–10, inside the reaction's band; null = band only
  dated: boolean             // false when the user didn't say when they went (rating flow); visitedOn is then the day rated
  dishes: string[]           // each 1–100 chars, ≤ 20
  note: string | null        // ≤ 2000 chars
  createdAt: number
}
```

Rating bands (`RATING_BAND` in `lib/types.ts`): `disliked` 1–4, `fine` 5–7, `loved` 8–10. A rating
outside its reaction's band is refused with 400 "That rating doesn't match the reaction.". With a
rating, the place's starting score is the rating (spread 0.6) instead of the band prior (8.5 / 6 /
3.5, spread 1), so with no comparisons the fitted score equals the rating. Lists show "Rated Nov 11"
instead of a visit date when `dated` is false.

### 1.3 `PlaceScore`

```ts
PlaceScore { userId: string, placeId: string, occasion: Occasion, score: number /* 0–10 */, updatedAt: number }
```

A place has at most one score per occasion. The Been list shows one row per (place, occasion).

### 1.4 `WantItem`

```ts
WantItem { userId: string, placeId: string, addedAt: number, source: WantSource }
```

### 1.5 `Rec`

```ts
Rec {
  place: Place
  score: number              // predicted score for this user, 0–10, calibration applied
  reason?: string            // one line from the AI rerank citing one of the user's places; absent without AI
  signals: {
    taste: number            // 0–1
    quality: number | null   // 0–1, null when no rating source
    distanceKm: number
    novelty: number          // 0–1
    visited: boolean         // the user has a logged visit here
    wanted: boolean          // on the Want to try list
  }
}
```

### 1.6 `CompareStep` and `LogResponse`

```ts
CompareStep { score: number | null, opponent: Place | null, asked: number }
LogResponse  = CompareStep & { visit: Visit }
```

`opponent` is the next "Which did you like more?" question (null when done). `asked` is how many
were answered so far. At most `MAX_COMPARISONS = 2` per visit. The opponent is always in the same
occasion and the same reaction band, closest score first, never one already compared with this place.

```ts
CompareAnswer      = CompareStep & { id: number, subjectScore: number | null }   // POST /api/comparisons
VisitEditResponse  = { visit: Visit, score: number | null }                      // PATCH /api/visits/{id}
Progress           = { rated: number, firstPicksAt: 5, goal: 10 }
DeckPlace          = { place: Place, distanceKm: number, guessedOccasion: Occasion, kind: string }
```

`Progress.rated` is the number of distinct places with at least one visit, across occasions. The
UI copy: under 5, "2 of 5 · Rate 3 more to get picks"; 5–9, "6 of 10 · Picks get better as you
rate"; 10 and up, hidden.

### 1.7 `WantSource`

`manual | rec | ask | import | lodestar | rate` (`rate` = Want to try from the rating deck).

---

## 2. Account

Copy for the screens is the web's (`app/account`, `components/account`); on iOS say "Tap" for
"Click" and "on this device" for "in this browser".

### 2.0 Guests

A visitor can rate before making an account. `POST /api/account/guest` (2.9), called right before
the first write, makes a **guest**: a real user with no email or password, on the same `fg_session`
cookie. Every route marked **Auth: session** works for a guest. Signing up from a guest session (2.2)
turns that same user into an account, so nothing moves. Signing in from a guest session (2.3) moves
the guest's places into the account and deletes the guest. A guest unseen for 30 days is deleted
with everything it saved. An active guest's cookie is renewed (fresh 30 days) once it has less than
23 days left, on any **Auth: session** call. A guest with 200 rated places must save an account
before rating a new place (5.2).

### 2.1 `GET /api/account`
**Auth:** none (signed out is a normal answer). `<what>` "account check". `cache-control: no-store`.
**Response `data`:**

```ts
{ user: null }
| { user: { email: string | null, guest: boolean, createdAt: number }, progress: Progress }
```

`email` is null only for a guest. This is the only call that decides signed-in, guest or signed-out
at launch (Lodestar's `session` state).

### 2.2 `POST /api/account/register`
**Body:** `{ email: string, password: string }` (email trimmed, lowercased, valid, ≤ 254; password 8–200).
**Response `data`:** `{ user: { email: string }, upgraded: boolean }`; sets `fg_session`.
`upgraded` is true when the request carried a guest session and that guest became this account (same
id, everything kept, the guest's old cookie is replaced).
**Errors:** 429 "Too many new accounts from here. Try again later." · 400 "Enter a valid email and a
password of at least 8 characters." · 409 "An account with that email already exists. Sign in instead."
(no guest session) · 409 "An account with that email already exists. Sign in to keep these places."
(guest session; the guest is untouched, offer Sign in, which merges).
**Limit:** `register`. `<what>` "sign-up".

### 2.3 `POST /api/account/login`
**Body:** `{ email: string, password: string }` (password 1–200).
**Response `data`:** `{ user: { email: string }, merged?: { visits: number } }`; sets `fg_session`.
`merged` is present when the request carried a guest session: the guest's visits, comparisons, Want
to try, skips, predictions and AI connections (where the account has none for that provider) moved
into the account, its occasions were refitted, and the guest was deleted. Say "Added N places to
your account." (count distinct places on the client if needed; `visits` counts visits).
**Errors:** 429 "Too many attempts. Try again in 15 minutes." · 400 "Enter your email and password." ·
401 "That email and password don't match an account."
**Limit:** `login`. `<what>` "sign-in".

### 2.4 `POST /api/account/logout`
**Auth:** none. **Body:** ignored (send `{}`).
**Response `data`:** `{}`. Deletes `fg_session`, this device's AI cookies and any pending AI sign-in.
An AI connection saved to the account stays with the account. The web ignores failures; so does iOS
(clear local state either way). Also clear `HTTPCookieStorage` cookies for the base host after it.

### 2.5 `POST /api/account` (sign out everywhere else)
**Auth:** session. **Body:** `{ "action": "signout-everywhere" }`.
**Response `data`:** `{}`. Ends every session, then signs this device back in with a fresh cookie.
**Errors:** 400 "Unknown action.". `<what>` "sign-out".

### 2.6 `DELETE /api/account`
**Auth:** session. **Body:** `{ password: string }` (1–200); a guest sends `{}` (no password).
**Response `data`:** `{}`. Deletes the account and everything saved with it, clears AI cookies and the session.
**Errors:** 400 "Enter your password to delete your account." · 401 "That password isn't right.".
`<what>` "account deletion". The web has this route; iOS needs it for App Store review (account deletion).

### 2.7 `POST /api/account/forgot`
**Auth:** none. **Body:** `{ email: string }`.
**Response `data`:** `{ message: "If an account exists for that address, a reset link is on its way." }`
(the same whether or not the address has an account, or a limit held the email back).
**Errors:** 429 "Too many attempts. Try again in 15 minutes." · 400 "Enter a valid email." ·
502 "The reset email couldn't be sent. Try again later.". **Limits:** `forgot`, `forgotEmail`, `forgotSentDaily`.
The emailed link is `APP_URL/reset?token=<43-char base64url>`.

### 2.8 `POST /api/account/reset`
**Auth:** none. **Body:** `{ token: string, password: string }` (token ≤ 100 chars; any other shape
gets the dead-link answer; password 8–200).
**Response `data`:** `{}`. Sets a new password, ends every other session, signs this device in.
**Errors:** 429 "Too many attempts. Try again in 15 minutes." · 400 "Choose a password of at least 8
characters." · 400 "This reset link is no longer valid. Request a new one.". `<what>` "password reset".

The reset link is an `https` URL, so until universal links exist (see ARCHITECTURE.md, Known gaps)
Account offers "Have a reset link?" with a paste field; extract `token` from the pasted URL's query, or
accept a bare token.

---

### 2.9 `POST /api/account/guest`
**Auth:** none. **Body:** ignored (send `{}`). `<what>` "guest start".
**Response `data`:** `{ user: { guest: boolean, email: string | null }, created: boolean }`.
With a live session (guest or account) it answers with that user, `created: false`, and makes
nothing. Otherwise it makes a guest, sets `fg_session` and answers `created: true`. Call it right
before the first write in the rating flow (first Been, Want to try, Not been or reaction tap), never
on launch, so a visitor who only looks makes no user.
**Errors:** 429 "Too many new visitors from here. Try again later." (`guest` limit, only when creating).

---

## 3. AI connection (ChatGPT / Grok)

Forage uses `@neelsatyavolu/shared-ai-auth` exactly like Lodestar: same providers, same fixed loopback
redirect URIs, same paste flow. There is no server AI key; every model call spends the user's own
subscription. An AI connection belongs to the signed-in account (saved sealed in `ai_connections`),
or to this device (cookies) when signed out; a device connection moves into the account at the next
signed-in AI call.

### 3.1 `GET /api/ai/status`
**Auth:** none. **Response `data`:** `{ connected: { codex: boolean, grok: boolean } }`.

Differences from Lodestar: there is **no `models` list and no model picker**, and the envelope is not
wrapped by `handle()` (a server failure answers a plain 500). `defaultProvider` on iOS is ChatGPT
when connected, else Grok, matching `tokensFor` in `lib/ai/index.ts`.

### 3.2 `POST /api/ai/{provider}/start`
`provider` ∈ `codex | grok`, else 404 "Unknown provider.". **Auth:** none. **Body:** ignored (`{}`).
**Limit:** in-memory `ai-start`, 10/min/IP.
Effect: makes PKCE (verifier, S256 challenge, state), stores `{verifier, state}` sealed in
`{provider}_pkce` (path `/api/ai`, 10 min), sets `fg_device` if missing. Each call replaces the
pending attempt.
**Response `data`:** `{ authorizeUrl: string }`:
- codex: `https://auth.openai.com/oauth/authorize?…redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback…`
- grok: `https://auth.x.ai/oauth2/authorize?…redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback…`

`<what>` "AI sign-in".

### 3.3 `POST /api/ai/{provider}/complete`
**Auth:** none, but it must carry the cookies `/start` set (same cookie store).
**Limit:** in-memory `ai-complete`, 10/min/IP.
**Body:** `{ callback: string }` (trimmed, 1–4000 chars). Any of: the full redirect URL
(`http://localhost:1455/auth/callback?code=…&state=…`), a query string (`?code=…&state=…`), or for Grok
only the bare code Grok shows.
**Response `data`:** `{ connected: "codex" | "grok" }`. Clears the PKCE cookie.
**Errors (exact):**
- 404 "Unknown provider."
- 400 "Paste the link or code first."
- 400 "Couldn't find a sign-in code in what you pasted."
- 400 "This sign-in expired. Click Connect again." (no PKCE cookie: over 10 minutes, or another cookie store)
- 400 "That link is from a different sign-in attempt. Click Connect again." (state mismatch; codex always checks state)
- 502 "Sign-in failed. The code may have expired. Click Connect again."

On iOS replace "Click Connect again" with "Tap Connect again" (`AIConnectLogic.nativeMessage`).

### 3.4 `POST /api/ai/{provider}/logout`
**Auth:** none. **Body:** ignored (`{}`). **Limit:** none.
**Response `data`:** `{ disconnected: "codex" | "grok" }`. Removes it from the account when signed in
and from this device's cookies in any case, and clears a pending sign-in. 404 "Unknown provider.".
The web ignores failures and then refreshes status.

### 3.5 Native sign-in flow (copied from Lodestar iOS)

Lodestar's app does this in `Features/Plan/Logic/AISignInBrowser.swift` and `AIConnectLogic.swift`
(contract: Lodestar `ios/docs/api-search.md` §4.2). Forage copies it unchanged except the names:

1. `POST /api/ai/{provider}/start`, read `authorizeUrl`.
2. Start `AILoopbackListener`: an `NWListener` on TCP with `requiredInterfaceType = .loopback`,
   port **1455** (codex) or **56121** (grok). If the port can't be opened, go to the paste fallback.
3. Present `ASWebAuthenticationSession(url: authorizeUrl, callback: .customScheme("forage"))` with
   `prefersEphemeralWebBrowserSession = false` (reuses a ChatGPT/X login in Safari). The custom scheme
   never fires; the session only provides the secure browser sheet.
4. The provider redirects the sheet's browser to `http://localhost:1455/auth/callback?code=…&state=…`
   or `http://127.0.0.1:56121/callback?code=…`, which reaches the listener. The listener answers a
   tiny `200 text/html` ("Connected. You can return to Forage."), rebuilds the full URL, stops, and the
   app cancels the session (ignore `canceledLogin`) and calls `/complete { callback: <that URL> }`.
   With `error=…` instead of `code`, show "Sign-in was cancelled or refused. Try again." and don't call
   `/complete`. Requests for other paths (favicon) are ignored and the listener keeps waiting.
5. **Paste fallback, always offered.** ChatGPT: "Sign in with your ChatGPT account. Forage picks the
   sign-in up when it finishes. If it doesn't, open it in Safari instead: you'll land on a page that
   doesn't load (a localhost address). That's expected: copy the full address from the address bar and
   paste it below." (Open `authorizeUrl` with `UIApplication.shared.open` so the address can be copied.)
   Grok: "Sign in with your X / Grok account. Grok then shows a code. Copy it and paste it below."
   Placeholders (mono): `http://localhost:1455/auth/callback?code=…` / "Code from Grok". Connect stays
   disabled until something is pasted and shows "Connecting…" while busy.
6. On success, `GET /api/ai/status` again.

Intro copy: "Forage's AI runs on your own ChatGPT or Grok subscription." Signed in: "The sign-in token
is encrypted and saved to your Forage account, so it works wherever you sign in. Disconnect to remove
it." Signed out: "The sign-in token is encrypted and kept only on this device. Sign in to Forage first
to save it to your account."

Unverified on a device in Lodestar too: whether the `ASWebAuthenticationSession` browser reaches the
app's loopback listener. The paste fallback works regardless. No backend change is needed: the PKCE
secret is in a cookie in the app's own store, and the browser only hands back `code`/`state`.

Without AI everything works except Ask; recs simply have no `reason`.

---

## 4. Places

### 4.1 `GET /api/places`
**Auth:** none needed. **Limits:** `places` and `placesDaily`, per account with a session, per IP
without (the rating deck's search runs before the first write). `<what>` "place search".
Two forms (query string):

| Form | Params | Answer |
|---|---|---|
| Search | `q` (trimmed, 1–200), optional `lat` and `lng` (both or neither) | up to 20 places, nearest to `lat/lng` first when given |
| Nearby | `lat`, `lng`, optional `radiusKm` (0.1–10, default 1.5) | up to 100 places, nearest first |

**Response `data`:** `{ places: Place[] }`. Every place is already stored and has a Forage `id`.
**Errors:** 429 "Too many searches. Wait a few minutes and try again." · 400 "Type a place name, or
share a location." · 503 "Place search isn't answering. Try again in a moment." (wording varies with
the source: "`<what>` isn't answering. Try again in a moment.") · 502 "Place search sent an answer
Forage couldn't read.".
If both Overpass mirrors fail, nearby answers with places already in the database (possibly empty),
not an error.

Search-as-you-type: debounce (the web waits ~300 ms), cancel the previous request, and pass the
device location so results sort by distance.

### 4.2 `GET /api/places/{id}`
**Auth:** session. `<what>` "place lookup".
**Response `data`:** `PlaceResponse`:

```ts
PlaceResponse {
  place: Place
  live: LiveDetails | null       // Google's live details; null without GOOGLE_PLACES_KEY, no match, or over the places limit
  liveError: string | null       // why `live` is missing when a lookup failed, e.g. "Live details aren't available right now."
  visits: Visit[]                // this user's visits here
  scores: PlaceScore[]           // this user's scores here, one per occasion
  wanted: boolean                // on Want to try
}
LiveDetails {
  rating: number | null          // 1–5
  ratingCount: number | null
  priceLevel: number | null      // 1–4
  phone: string | null
  website: string | null
  mapsUrl: string | null         // Google Maps link; open in Maps/Safari
  openNow: boolean | null
  hours: string[]                // one line per weekday, already formatted
  summary: string | null
}
```

**Errors:** 404 "That place wasn't found." (bad UUID or unknown id).
Google data must be shown as fetched, never cached on the device beyond the screen's life (Google's
terms; the server never stores it either). iOS calls nothing at Google: the server does, and only when
the owner has set a key. With no key the app shows OSM data only, which is free.

---

## 5. Visits and comparisons (Log)

### 5.1 `GET /api/visits`
**Auth:** session. `<what>` "visit list". `cache-control: no-store`.
**Response `data`:** `{ visits: Visit[], places: Place[], scores: PlaceScore[] }` (`places` are the
distinct places the visits reference). The Been list is derived on the client: one row per (place,
occasion) with the score (or null), the latest reaction, the latest `visitedOn`, and the visit count
(`BeenRow` in `components/lists/types.ts`, built by `beenRows()` in `components/lists/been.ts`; port it), sorted by score.

### 5.2 `POST /api/visits`
**Auth:** session. **Limit:** `writes`. `<what>` "visit log".
**Body (`VisitInputSchema`):**

| Field | Type | Rule |
|---|---|---|
| `placeId` | UUID | must exist, else 404 "That place wasn't found." |
| `visitedOn` | `"YYYY-MM-DD"` | valid ISO date |
| `reaction` | `Reaction` | |
| `occasion` | `Occasion` | |
| `rating` | `Int?` | whole 1–10 inside the reaction's band (1.2); default `null` |
| `dated` | `Bool?` | default `true`; the rating flow sends today's date with `false` |
| `dishes` | `[String]`? | each trimmed 1–100, ≤ 20; default `[]` |
| `note` | `String?` | trimmed, ≤ 2000; default `null` |

**Response `data`:** `LogResponse` (`{ visit, score, opponent, asked }`). If `opponent` is non-null,
ask "Which did you like more?" between the logged place and `opponent`, then call 5.4.
**Errors:** 429 "Too many changes. Wait a few minutes and try again." · 404 as above · 400 zod message
(400 "That rating doesn't match the reaction." for an out-of-band rating) · 403 "Save your places to
keep rating." (a guest with 200 rated places, adding a new one).
Logging a visit at a place the user marked Not been deletes that skip.

The rating flow sends `{ placeId, visitedOn: today, reaction, occasion: guessedOccasion, rating: null, dated: false }`
on the reaction tap, then `PATCH` with `{ rating }` for the optional fine-tune.

Quick start (`/log/quick` on the web) is just repeated `POST /api/visits` with `reaction: "loved"`,
today's date, the chosen occasion, and no comparisons asked.

### 5.3 `PATCH /api/visits/{id}` and `DELETE /api/visits/{id}`
**Auth:** session. **Limit:** `writes`.
- PATCH body: any subset of `{ visitedOn, reaction, occasion, rating, dated, dishes, note }` (same
  rules; `placeId` can't change). Fields left out keep their value. The band check runs on the
  merged visit, so changing `reaction` on a rated visit needs a matching `rating` (or `rating: null`)
  in the same PATCH. **Response `data`:** `VisitEditResponse` (`{ visit, score }`, the place's score in
  its occasion now). Refits the old and new occasion. `<what>` "visit edit".
- DELETE body: none (send `{}` or nothing; it is not read). **Response `data`:** `{}`. Refits the
  occasion. `<what>` "visit delete".

**Errors:** 404 "That visit wasn't found." (bad UUID, another user's, or gone) · 429 as above.

### 5.4 `POST /api/comparisons`
**Auth:** session. **Limit:** `writes`. `<what>` "comparison".
**Body:**

```json
{
  "comparison": { "winnerPlaceId": "<uuid>", "loserPlaceId": "<uuid>", "occasion": "casual" },
  "next": { "subjectPlaceId": "<uuid of the place being logged>", "asked": 1 }
}
```

`next` is optional; `asked` (1–2) is how many questions are now answered including this one.
**Response `data`:** `CompareAnswer` (`{ id, score, subjectScore, opponent, asked }`): `id` of the saved
answer (for undo, 5.7), the subject's score now (`subjectScore`, equal to `score`), and the next
opponent, or `opponent: null` when done. Without `next`, `score`, `subjectScore` and `opponent` are
null. To show "now 8.7" after the last question the client wants, send `next` with the real `asked`
and ignore `opponent` (the rating flow asks at most 1 per place while rated < 10).
**Errors:** 400 "A place can't be compared with itself." · 400 "Log both places for this occasion
before comparing them." · 429 as above.

### 5.6 `GET /api/comparisons/next?placeId={uuid}&occasion={Occasion}&asked={0..2}`
**Auth:** session. `<what>` "next comparison". `cache-control: no-store`.
**Response `data`:** `CompareStep` (`{ score, opponent, asked }`) for the place in that occasion; after
an undo or a reload. `opponent` is null when `asked` is 2 or no same-band place is left.
**Errors:** 400 "Give a place, an occasion and how many were asked.".

### 5.7 `DELETE /api/comparisons/{id}[?placeId={uuid}]`
**Auth:** session. **Limit:** `writes`. `<what>` "comparison undo". Body not read (send `{}`).
Deletes one of the user's own answers and refits its occasion.
**Response `data`:** `{ score: number | null }`: the score of `placeId` in that occasion afterwards
(null without `placeId`).
**Errors:** 404 "That comparison wasn't found." (bad id, another user's, or gone) · 400 "That place
id isn't valid." · 429 as above.

### 5.5 `GET /api/feedback?placeId={uuid}`
**Auth:** session. `<what>` "feedback". `cache-control: no-store`.
**Response `data`:** `{ feedback: { predicted: number, actual: number, at: number } | null }`.
Shown on a place as "We predicted 8.4, you gave 7.1". Resolves any open predictions first, so call it
after logging a visit to a place that was recommended.
**Errors:** 400 "Give a place id.".

---

## 5A. Rating flow (rate places near you)

Design: `docs/superpowers/specs/2026-11-11-rate-nearby-and-web-cleanup.md`, Part 1. Step A shows
the deck (5A.1) and records Been / Want to try (6.2, `source: "rate"`) / Not been (5A.2). Step B is
`POST /api/visits` plus an optional `PATCH` (5.2, 5.3). Step C is 5.4. Undo map:

| Action | Undo call |
|---|---|
| Rated (visit created) | `DELETE /api/visits/{id}` |
| Fine-tune or occasion change | `PATCH /api/visits/{id}` with the previous values |
| Comparison answered | `DELETE /api/comparisons/{id}` (5.7) |
| Want to try | `DELETE /api/want {placeId}` |
| Not been | `DELETE /api/rate/skips {placeId}` (5A.2) |

### 5A.1 `POST /api/rate/deck`
**Auth:** none needed (works signed out, as a guest or signed in). It writes nothing; it is a POST
only because `exclude` can be long. **Limits:** `deckAnon` per IP with no session, else `places` and
`placesDaily` per user. Byte cap 40,000. `<what>` "rating deck". `cache-control: no-store`. Use the
`recs` timeout (the nearby lookup may fetch map tiles).
**Body:**

| Field | Type | Rule |
|---|---|---|
| `lat`, `lng` | Double | −90…90, −180…180 |
| `radiusKm` | Double? | 0.2–3, default 1.5 |
| `limit` | Int? | 6–48, default 24 |
| `exclude` | `[UUID]`? | ≤ 500, default `[]`: ids already shown this session (for "Show more places") |

**Response `data`:**

```ts
{ places: DeckPlace[], hasMore: boolean, source: "cache" | "overpass" | "stale" | "photon" | "stored", progress: Progress }
```

Places come from the free nearby search (OSM, tile cached; no Google). Left out: `exclude`, and for
a user, places they rated, have on Want to try, or marked Not been in the last 180 days. Order is
"most likely you've been": `0.6 · e^(−km/0.6) + 0.4 · known`, where `known` adds 0.35 for an OSM
brand or wikidata tag, 0.15 for opening hours, 0.15 for a website, 0.1 for a cuisine, and
`min(0.25, 0.05·n)` when n ≥ 3 Forage users logged the place. No more than 3 tiles in a row share an
amenity. `kind` is the first cuisine or else the amenity, title case ("Cafe", "Fast Food").
`guessedOccasion`: the place's single tagged occasion; else `special` at price 4; else `quick` for
fast food, food court, ice cream, cafe, bakery; `night_out` for bar, pub, biergarten; else `casual`.
**Errors:** 400 zod message · 429 "Too many requests. Wait a few minutes and try again.".

### 5A.2 `POST /api/rate/skips` and `DELETE /api/rate/skips`
**Auth:** session (call 2.9 first). **Limit:** `writes`. **Body:** `{ placeId: UUID }`.
- POST ("Not been"): **Response `data`:** `{ skip: { placeId: string, createdAt: number } }`. Skipping
  twice keeps the first. Keeps the place out of the deck for 180 days. 404 "That place wasn't
  found.". `<what>` "skip".
- DELETE (undo): **Response `data`:** `{ removed: boolean }`. `<what>` "skip undo".

### 5A.3 `GET /api/rate/progress`
**Auth:** none needed. `<what>` "progress". `cache-control: no-store`.
**Response `data`:** `Progress`; `rated: 0` with no session. Use it at launch to decide whether to
show the rating flow (rated < 10 and not dismissed on this device), and for the Near me prompt card.
Under 5 rated, Near me shows "Rate 5 places to get picks." and doesn't call `/api/recs`.

---

## 6. Want to try

### 6.1 `GET /api/want`
**Auth:** session. `<what>` "want list". **Response `data`:** `{ items: WantItem[], places: Place[] }`.

### 6.2 `POST /api/want`
**Auth:** session. **Limit:** `writes`. **Body:** `{ placeId: UUID, source?: WantSource }` (default
`"manual"`; use `"rec"` from Near me/Explore, `"ask"` from Ask, `"rate"` from the rating deck). Adding twice keeps the first entry.
**Response `data`:** `{ item: WantItem }`. **Errors:** 404 "That place wasn't found." · 429 as above.

### 6.3 `DELETE /api/want`
**Auth:** session. **Limit:** `writes`. **Body:** `{ placeId: UUID }` (required: DELETE with a body).
**Response `data`:** `{ removed: boolean }`.

---

## 7. Recommendations

All three recs routes run the same engine (`lib/recs`): real nearby places from OSM, fast scoring,
then (with AI connected) an AI rerank of the top 30 that can only return those places. Any AI error
falls back to the fast ranking, except in Ask. Each call stores predictions for the first 10 new
places shown (feeds 5.5).

### 7.1 `POST /api/recs` (Near me)
**Auth:** session. **Limit:** `recs`. Body cap 4,000 bytes. `<what>` "recommendations".
**Body:**

| Field | Type | Rule |
|---|---|---|
| `lat`, `lng` | Double | required |
| `radiusKm` | Double? | 0.1–5, default 2 |
| `filter` | `"new" \| "goto"`? | default `"new"` ("Something new" leaves out visited places; "Go-to" shows only ones you liked) |
| `want` | String? | trimmed, ≤ 500 |
| `partySize` | Int? | 1–20 |
| `openNow` | Bool? | |
| `occasion` | `Occasion`? | |
| `mode` | `"near"`? | only `"near"` is accepted; omit it |

**Response `data`:** `{ recs: Rec[], reasons: boolean }` (≤ 30, best first; `reasons` is true when any
rec has an AI `reason`). `cache-control: no-store`.
**Errors:** 429 "Too many requests. Wait a few minutes and try again." · 400 zod message · Places
errors from 4.1.

### 7.2 `POST /api/explore/recs` (Explore)
**Auth:** session. **Limit:** `recs`. Body cap 4,000. `<what>` "recommendations".
**Body:** `{ lat, lng, radiusKm, mode, want?, partySize?, openNow?, occasion? }` where `radiusKm` is
**required** (0.1–50; use the chosen area's `radiusKm` from 7.4) and `mode` ∈ `travel | splurge |
stretch` (`near` is refused). Travel and Splurge show new and visited places; Stretch only new.
**Response `data`:** `{ recs: Rec[] }` (no `reasons` flag here).

### 7.3 `POST /api/recs/ask` (Ask)
**Auth:** session, and AI connected. **Limits:** `recs`, then `ai`. Body cap 4,000. `<what>` "Ask".
**Body:**

| Field | Type | Rule |
|---|---|---|
| `lat`, `lng` | Double | required |
| `want` | String | trimmed, 3–500, else 400 "Say a bit more about what you want." |
| `radiusKm` | Double? | 0.1–5, default 3 |
| `partySize` | Int? | 1–20 |
| `occasion` | `Occasion`? | |

**Response `data`:** `{ recs: Rec[] }`: at most 3, each with a `reason`; new places and go-tos both
qualify. `cache-control: no-store`.
**Errors:** 401 "Connect ChatGPT or Grok on the Account page to use Ask." (offer Connect AI; don't
sign out) · 401 "Connect your … account first." (token couldn't refresh) · 429 "Too many requests.
Wait a few minutes and try again." or "Too many AI requests. Wait a few minutes." · 502 "The AI didn't
pick any of the nearby places. Try again." / "Couldn't reach the AI. Try again." / "The model did not
respond. Try again." / other model messages.

### 7.4 `GET /api/explore/geocode?q=`
**Auth:** none. **Limits:** `places` and `placesDaily`, keyed per IP. `<what>` "place search".
`q` trimmed, 2–120 chars, else 400 "Type at least two letters.".
**Response `data`:** `{ areas: Area[] }`, at most 6:

```ts
Area { label: string /* "Mission District, San Francisco, United States" */, name: string, lat: number, lng: number, radiusKm: number }
```

**Errors:** 429 "Too many searches. Wait a few minutes and try again." · 502 "Place search isn't
answering. Try again in a moment.".
iOS keeps this server call (Photon, free) so the area list matches the web. `MKLocalSearchCompleter`
is a free alternative if the server is slow, but its results carry no `radiusKm`; pick 3 km for a
neighborhood and 8 km for a city if it is ever used.

---

## 8. Taste profile

`TasteView`:

```ts
TasteView {
  summary: string                    // "" when none yet
  summaryEdited: boolean             // the user wrote it; the AI won't overwrite it
  likes: [string, number][]          // up to 8 [tag, weight] pairs, weight > 0.05, strongest first
  dislikes: [string, number][]       // up to 8, weight < -0.05, most negative first
  updatedAt: number | null
}
```

Tags look like `"cuisine:ramen"`, `"dish:dumplings"`, `"vibe:loud"`, `"price:2"`, `"occasion:night_out"`,
`"attr:outdoor_seating"`. Decode each pair as a two-element array (`[String, Double]`, a custom
`Decodable`). Show the part after the colon, with `_` as a space; group by the prefix.

### 8.1 `GET /api/taste`
**Auth:** session. `<what>` "taste profile". **Response `data`:** `TasteView`.

### 8.2 `PUT /api/taste`
**Auth:** session. **Limit:** `writes`. Body cap 8,000. `<what>` "taste summary".
**Body:** `{ summary: string | null }` (trimmed, ≤ 2000). A string saves it as the user's own;
`null` or `""` hands it back to the AI. **Response `data`:** `TasteView`.

### 8.3 `POST /api/taste/refresh`
**Auth:** session. **Limit:** `writes` (plus `ai` per model call). **Body:** ignored (`{}`).
`<what>` "taste refresh". Timeout class `ai`.
**Response `data`:** `TasteView & { aiConnected: boolean, cardsWritten: number, summaryWritten: boolean }`.
Recomputes weights; with AI connected also writes tag cards for logged places and the summary
(unless edited). AI errors are **not** swallowed here: 401/429/502 AI messages as in 7.3.

---

## 9. Lodestar link

All routes need a Forage session. Lodestar errors come back as `HttpError` with the
`LodestarError` status:

| Status | Message |
|---|---|
| 409 | "Connect Lodestar from Account first." (not linked) |
| 409 | "Lodestar ended this connection. Connect again from Account." (revoked; the link is deleted) |
| 409 | "Lodestar didn't accept the sign-in. Connect again from Account." |
| 400 | Lodestar's own refusal text, ≤ 300 chars (tool error) |
| 502 | "Can't reach Lodestar. Try again." / "Lodestar sent an unexpected answer." / "Lodestar had a problem (HTTP n)." / "Lodestar couldn't run that." / "Lodestar refused the sign-in (HTTP n)." |
| 429 | "Too many Lodestar requests. Wait a few minutes and try again." (`lodestar` limit) |

On any 409, refresh `GET /api/lodestar` and show the Connect button again.

### 9.1 `GET /api/lodestar`
**Response `data`:** `{ linked: false }` or `{ linked: true, label: string | null, connectedAt: number }`
(`label` is Lodestar's host, e.g. "lodestar.xanom.co"). `cache-control: no-store`. `<what>` "Lodestar check".

### 9.2 `DELETE /api/lodestar`
**Body:** none read (send `{}`). **Response `data`:** `{ linked: false }`. Deletes Forage's copy of the
tokens. Lodestar has no revoke endpoint, so tell the user to also remove Forage in Lodestar's settings.
`<what>` "Lodestar disconnect".

### 9.3 `POST /api/lodestar/connect`
**Body:** none read (send `{}`). **Limit:** `lodestar`. `<what>` "Lodestar connect".
Sets `fg_lodestar_flow` (sealed PKCE verifier and state bound to this account; HttpOnly, path
`/oauth/lodestar/callback`, 10 minutes).
**Response `data`:** `{ url: string }`: Lodestar's consent page,
`{LODESTAR_URL}/oauth/authorize?response_type=code&client_id={APP_URL}/oauth/client-metadata.json&redirect_uri={APP_URL}/oauth/lodestar/callback&code_challenge=…&code_challenge_method=S256&state=…&scope=trips&resource={LODESTAR_URL}/api/mcp`.

### 9.4 `GET /oauth/lodestar/callback` (not JSON)
Lodestar redirects the browser here with `code`, `state`, `iss` (or `error`). It needs the
`fg_session` and `fg_lodestar_flow` cookies, exchanges the code and saves the tokens, then 303-redirects
to `{APP_URL}/account?lodestar=<outcome>`, `outcome` ∈ `connected | cancelled | expired | signed-out |
failed`. Web copy per outcome:

| Outcome | Text |
|---|---|
| connected | "Lodestar is connected." |
| cancelled | "Connecting was cancelled in Lodestar." |
| expired | "That sign-in took too long or came from another session. Try again." |
| signed-out | "Sign in to Forage first, then connect Lodestar." |
| failed | "Lodestar couldn't be connected. Try again." |

How iOS drives this: section 11.

### 9.5 `GET /api/lodestar/trips`
**Limit:** `lodestar`. `<what>` "Lodestar trips". `no-store`.
**Response `data`:** `{ trips: TripSummary[] }`, soonest first:

```ts
TripSummary { id: string /* UUID */, title: string, destination: string | null, startDate: string | null, endDate: string | null }
```

Explore shows each trip; picking one geocodes `destination` with 7.4 (first area) and fills dates.

### 9.6 `GET /api/lodestar/trips/{id}`
**Limit:** `lodestar`. `<what>` "Lodestar trip". `no-store`. 400 "That trip id isn't valid." for a bad UUID.
**Response `data`:**

```ts
{
  trip: TripSummary,
  days: { day: string /* YYYY-MM-DD */, meals: { title: string, time: string | null /* "HH:MM" */ }[] }[]  // ≤ 60 days; [] without dates
}
```

### 9.7 `POST /api/lodestar/add`
**Limit:** `lodestar`. Body cap 4,000. `<what>` "add to trip".
**Body:** `{ tripId: UUID, placeId: UUID, day: "YYYY-MM-DD", time?: "HH:MM" | null, note?: string | null }`
(`time` 24-hour, else 400 "Use a HH:MM time."; `note` trimmed ≤ 500). The restaurant's details come from
Forage's database, not the request.
**Response `data`:** `{ itemId: string | null }`.
**Errors:** 404 "That restaurant isn't in Forage any more." plus the Lodestar table above.

---

## 10. Routes iOS does not call

- `GET /oauth/client-metadata.json`: read by Lodestar only.
- Pages (`/`, `/explore`, `/lists`, `/log`, `/log/quick`, `/ask`, `/account`, `/reset`) are HTML.

## 11. Connect Lodestar on iOS

**Why it can't work unchanged with `ASWebAuthenticationSession`.** `POST /api/lodestar/connect` sets
`fg_lodestar_flow` in the app's `HTTPCookieStorage`. `ASWebAuthenticationSession` runs in Safari's
cookie jar, which has neither `fg_session` nor `fg_lodestar_flow`. When Lodestar redirects that browser to
`APP_URL/oauth/lodestar/callback`, Forage sees no session and answers `?lodestar=signed-out`. The app
can't put cookies into the session's browser.

**Recommended flow (needs one small web change, see "Web change" below):**

1. `POST /api/lodestar/connect` with the app's client, read `url`.
2. Present `ASWebAuthenticationSession(url:, callback: .https(host: "forage.xanom.co", path: "/oauth/lodestar/callback"))`
   with `prefersEphemeralWebBrowserSession = false`, so a Lodestar login in Safari is reused. The
   https callback (iOS 17.4+) is intercepted by the system before the page loads, so Safari never hits
   the callback without cookies.
3. The completion handler gets the callback URL. Read `code`, `state`, `iss` and `error` from its query.
   - `error=access_denied` → "Connecting was cancelled in Lodestar."; other `error` → "Lodestar couldn't
     be connected. Try again."; user closed the sheet (`canceledLogin`) → no message.
4. `POST /oauth/lodestar/callback` with JSON `{ code, state, iss }` through the app's `APIClient`.
   The request path matches the flow cookie's path, so `HTTPCookieStorage` sends `fg_lodestar_flow` with
   `fg_session`. Answer: the envelope, `{ ok: true, data: { linked: true, label, connectedAt } }`, or
   `{ ok: false, error }` with the outcome texts from 9.4 (400 expired, 401 "Sign in first.", 502 failed).
5. Refresh `GET /api/lodestar`.

**Web change needed** (not made; the iOS app waits for it): add a `POST` handler to
`app/oauth/lodestar/callback/route.ts` that runs the same checks as `GET` (session, `lodestar` limit,
`iss`, `openFlow`, code length, `finishLink`), answers JSON via `ok()`/`fail()`, and deletes the flow
cookie. Then serve `/.well-known/apple-app-site-association` with
`{"webcredentials":{"apps":["VTQW687WBQ.co.xanom.forage"]}}` (add `applinks` for `/reset` at the same
time to fix password reset links) and give the app the `com.apple.developer.associated-domains`
entitlement `webcredentials:forage.xanom.co`. No change to the OAuth client: the redirect URI stays the
registered `APP_URL/oauth/lodestar/callback`.

**Alternative if associated domains are not possible** (no paid team, or a dev tunnel host): register a
second redirect URI `forage://oauth/lodestar/callback` in `clientMetadata` (Lodestar accepts custom
schemes and matches exactly; it re-reads the metadata document at most every 24 hours), let
`POST /api/lodestar/connect` take `{ "client": "ios" }` and put that redirect URI in the authorize URL
and in the sealed flow, use the flow's redirect URI in the token exchange, and add the same `POST`
handler as above. iOS then uses `callback: .customScheme("forage")`.

**Interim without any web change** (only if the app ships first): load `url` in a `WKWebView` whose
`WKHTTPCookieStore` is seeded with `fg_session` and `fg_lodestar_flow` from `HTTPCookieStorage`, let the
callback run inside it, and close the view when navigation reaches `/account?lodestar=<outcome>` (read
the outcome, cancel that navigation). It works but embeds a third-party sign-in in a web view (RFC 8252
advises against it) and can't reuse Safari's Lodestar login, so treat it as temporary.
