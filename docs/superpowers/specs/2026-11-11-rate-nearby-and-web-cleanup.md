# Rate places near you, guest start, and web cleanup

Design, 2026-11-11. Nothing here is built yet. It covers two things the owner asked for:

1. "When you open it, based on the places around you, it makes you rank them out of 10, then against each other, to get recommendations. Make that intuitive and easy on mobile and web." Follow-up: "look how Beli does it so we can get them insta onboarded."
2. "Make the web app cleaner, easier to use and easier to find things in."

Part 1 is the rating flow and the guest start it needs. Part 2 is a page-by-page cleanup plan for the web app, based on running it locally with a seeded account (7 visits near Civic Center, San Francisco) and taking screenshots of every page at 1280 px and 390 px, signed in and signed out.

Constraints that apply throughout: everything stays free (no paid APIs, no new Google calls), visuals follow `~/DESIGN.md` and the tokens in `app/globals.css` and `ios/Forage/UI/Theme`, UI copy is short and plain with no emoji, zod at every API boundary, tests next to logic, small files.

---

## Part 1. Rate places near you

### 1.1 What we copy from Beli and what we avoid

Beli's rating is fast: tap a place, pick one of three buttons ("I liked it!", "It was fine", "I didn't like it"), answer a few "which did you like more?" questions against places in the same band (with a "too tough" skip), and a score out of 10 appears. About five taps.

Its onboarding is where people complain. Roughly 40% of the complaints are forced invites and contact access before the app is usable. Others: sign-up asks for too much before you see anything, the flow can't be backed out of, Google Maps imports only arrive as want-to-try, a diner gets compared with a Michelin place, and there are too many comparisons per entry. Recommendations unlock after about 15 ranked places.

Forage's version:

| Rule | What it means here |
| --- | --- |
| No account to start | The first screen a new visitor sees is the rating flow. The first write creates a guest user. Signing up later turns that same user into a full account, so nothing is lost. The save prompt appears after 5 ratings and on the finish screen, never before. |
| Ask only for what is needed, when it is needed | Location is asked for only when the flow needs it, with a one-line reason, and city search is the fallback. No contacts, no notifications, no invites, no other permissions. |
| Fewest taps | Step A: tap every place you've been on a grid of nearby places. Step B: per place, three buttons, occasion already guessed, optional fine-tune out of 10. Step C: at most one head-to-head per place while onboarding (two in the normal flow), same occasion and band only, with "Too tough". The score shows right away. |
| Picks early | First picks after 5 rated places, not 15. Forage's taste engine works per user, so it doesn't need a crowd. Progress stays visible: "6 of 10 · picks get better as you rate". |
| Nothing is a trap | Undo the last action at any time. Back out at any step without losing what was already rated. |

When anything below conflicts with this table, the table wins.

### 1.2 The flow

The flow lives at `/rate` on web and in a full-screen cover on iOS (`RateFlowView`). Three steps, one screen each.

#### Entry points

- **Automatic on open.** When the viewer has fewer than 10 rated places and hasn't dismissed the flow on this browser or device, opening the app lands on the flow.
  - Web: `app/page.tsx` (a server component) reads the session cookie and the `fg_rate_dismissed` cookie. If rated < 10 and the cookie is absent, it redirects to `/rate`. A visitor with no session counts as 0 rated. The redirect is server-side, so there's no flash of Near me.
  - iOS: `RootView` presents `RateFlowView` as a `fullScreenCover` on launch under the same rule. Dismissal is stored in `UserDefaults` (`rateDismissedAt`).
- **Dismiss.** Every step has a close control (top left, "Close"). Closing sets `fg_rate_dismissed=1` (a plain, non-httpOnly cookie, 30 days, path `/`) or the iOS default, then goes to Near me. Anything already rated is kept.
- **Prompt card on Near me, not a nag.** While rated < 10, Near me shows one card at the top: "Rate places you've been · 3 of 10 · Picks get better as you rate." with a "Rate places" button. The card has no close button and no animation, and it's the only prompt. It goes away at 10.
- **Always reachable.** A "Rate places" button on Near me (in the location row) and on Lists (the page's single accent action). On iOS: a toolbar button on Near me and Lists.

#### Step A. "Which of these have you been to?"

```
Close                                                 3 of 10
Which of these have you been to?
Places near Civic Center. Tap every one you've been to.
[ Search a place not shown                         ]

┌──────────────┐ ┌──────────────┐
│ Zenpo Sushi  │ │ Rad Radish   │   tile: name (15px, 2 lines max),
│ Sushi · 290 m│ │ Cafe · 320 m │   type or cuisine · distance (mono 12),
│     ✓ Been   │ │  ☐   ☆   ✕  │   three controls along the bottom
└──────────────┘ └──────────────┘
... 24 tiles, then "Show more places"

            [ Next: rate 4 places ]   (sticky bottom bar)
```

- Location: if the browser or iOS hasn't granted location yet, the step first shows one line and two buttons: "Forage lists places near you to rate. Your location isn't saved." `[Use my location]` `[Search a city instead]`. The system prompt only appears after the first button. If location is denied or fails, the city search (the existing `/api/explore/geocode`, Photon) is shown in its place. On web this reuses `useLocation` and `LocationBar`'s search; on iOS, `SpotModel` and `AreaSearchModel`.
- The grid is 2 columns under 560 px and 3–4 columns above, with tiles at least 44 px tall. The whole tile toggles **Been** (check mark, accent border). Two small icon buttons on each tile:
  - **Want to try** (bookmark). Adds the place to Want to try right away and fades the tile. It's never rated.
  - **Not been** (✕). Remembers the skip and removes the tile. A remembered skip keeps the place out of the grid for 180 days.
  - A tile that is just left alone records nothing. It drops out of the next page of tiles only because the client excludes ids it has already shown.
- Search: the box under the lede searches `/api/places?q=` (Photon) near the current spot, and a result can be marked Been or Want to try the same way. This covers places that weren't shown.
- "Show more places" asks for the next 24 with everything already shown excluded.
- The sticky button reads "Next: rate N places" and is disabled at 0. With 0 selected and at least one Want or Not been, a quiet link "Done for now" goes to the finish screen.

#### Step B. "How was it?" (one place at a time)

```
Back                       Place 2 of 4                    3 of 10
Zenpo Sushi
Sushi · Grove Street · 290 m

How was it?
[ Loved it ]  [ It was fine ]  [ Didn't like it ]      three full-width buttons on phone

Occasion  Casual ▾        (pre-guessed; one tap opens the four choices)

Fine-tune (optional)   8   9   10                      only the chosen band's numbers
Add details ›            (date, dishes, note: the existing visit form fields, folded)
```

- One tap on a reaction saves the visit right away (`POST /api/visits`) with the guessed occasion and `rating: null`. The score appears at once beside the name (the band prior, e.g. 8.5). The fine-tune row then appears with the band's whole numbers: Didn't like 1–4, Fine 5–7, Loved 8–10. Tapping one updates the visit (`PATCH /api/visits/:id {rating}`) and the score. "Add details" opens the date, dishes and note fields from `components/log/visit-form.tsx`, which save with the same PATCH.
- Changing the occasion after saving is the same PATCH, and the server refits both occasions (already true in `editVisit`).
- After the reaction is saved, if the response has an `opponent`, Step C runs for this place. Otherwise it goes straight to the next selected place.
- Saving the reaction is the only required tap. The fine-tune row and details stay open until the user moves on with "Next place" (or Enter). Picking a reaction on the next place also moves on.

Occasion guess (`lib/rate/occasion.ts`, pure, tested), first match wins:

1. `place.tags.occasions` has exactly one entry: use it.
2. `priceLevel === 4`: `special`.
3. Amenity (the first entry of `tags.attributes`, e.g. "fast food"): `fast food`, `food court`, `ice cream`, `cafe`, `bakery` → `quick`; `bar`, `pub`, `biergarten` → `night_out`; `restaurant` → `casual`.
4. Otherwise `casual`.

#### Step C. "Which did you like more?"

```
Which did you like more?                         Casual
┌────────────────────┐   ┌────────────────────┐
│ Zenpo Sushi        │   │ Café Valor         │
│ Sushi · 290 m      │   │ Cafe · 8.2         │
└────────────────────┘   └────────────────────┘
                Too tough        (quiet button)
Zenpo Sushi is now 8.7         (updates after the answer, before moving on)
```

- The opponent comes from the existing picker (`lib/scoring/pick.ts`): same occasion, same reaction band, closest score, never one already compared. That is how we avoid comparing a diner with a Michelin place: occasion keeps them apart, and so does band.
- **At most one question per place inside `/rate` while the user has fewer than 10 rated places, and at most two after that.** The normal log flow keeps two. The server already returns at most `MAX_COMPARISONS = 2`. The client stops after its own limit by not sending `next`.
- "Too tough" writes nothing and moves on.
- After an answer, the new score shows for about 600 ms ("Zenpo Sushi is now 8.7"), then the flow moves to the next place. On iOS, a light haptic plays.

#### Finish

```
That's 6 rated.
Your picks near Civic Center are ready.          (rated >= 5)
Rate 2 more to unlock picks.                     (rated < 5)

1  Uccello Lounge     8.8        the places just rated, best first, scores in mono
2  Plaj               8.5
...
[ See picks near you ]        accent, goes to Near me (or "Rate more places" while < 5)
Save your places               guests only: inline email + password, "Not now"
```

#### Progress, everywhere

`rated` is the number of distinct places with at least one visit, across all occasions. Copy:

- Under 5: "2 of 5 · Rate 3 more to get picks".
- 5 to 9: "6 of 10 · Picks get better as you rate".
- 10 and up: hidden. "Rate places" stays in the toolbar.

Near me under 5 rated shows the prompt card and the line "Rate 5 places to get picks." It doesn't call `/api/recs`. At 5 or more, picks show as now, with the prompt card above them until 10.

#### Save prompt for guests

- After the 5th rating, one inline panel appears below Step B's buttons. It is not a modal and doesn't block: "Save your places so you don't lose them." Email, password, `[Save]`, `Not now`. "Not now" hides it until the finish screen.
- The finish screen shows the same form, along with "Already have an account? Sign in", which merges this guest into that account (see 1.3).
- Nowhere else asks a guest to sign up. Account shows the same form in place of "Signed in".

#### Undo and backing out

- Every write in the flow pushes an entry onto a client-side undo stack (at most 20 entries, cleared when the flow closes). "Undo" sits at the top right of every step (Cmd/Ctrl+Z on web) and reverses the last entry:

| Action | Undo call |
| --- | --- |
| Rated (visit created) | `DELETE /api/visits/:id` (exists; refits) |
| Fine-tune or occasion change | `PATCH /api/visits/:id` with the previous values |
| Comparison answered | `DELETE /api/comparisons/:id` (new) |
| Want to try | `DELETE /api/want {placeId}` (exists) |
| Not been | `DELETE /api/rate/skips {placeId}` (new) |

  After an undo, the flow goes back to the step and place the action came from.
- "Back" in Step B and Step C goes to the previous place and deletes nothing. "Close" keeps everything. A reload of `/rate` starts again at Step A with already rated places excluded, so nothing is lost and nothing repeats.

#### Keyboard (web)

| Step | Keys |
| --- | --- |
| A | Arrow keys move between tiles. Space or Enter toggles Been. `W` Want to try. `S` or `X` Not been. `N` next step. `/` focuses search. |
| B | `1`–`9`, `0` (= 10) sets reaction and fine-tune in one press (e.g. `8` = Loved, rating 8). `L`, `F`, `D` pick a band with no fine-tune. `O` opens occasion; `1`–`4` pick one while it's open. `W` marks Want to try instead and moves on. `S` marks Not been and moves on. Enter goes to the next place. |
| C | `←` left wins, `→` right wins, `↓` or `T` too tough. |
| Any | Cmd/Ctrl+Z or `U` undo. Esc closes (asks nothing; everything is saved). |

A small "Keys" toggle in the footer shows this table. Keys are ignored while focus is in a text field.

### 1.3 Guest users

#### Schema (append to `LATER` in `lib/db/schema.ts`)

```sql
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
-- A full account always has both; a guest has neither.
ALTER TABLE users ADD CONSTRAINT users_guest_shape
  CHECK ((is_guest AND email IS NULL AND password_hash IS NULL)
      OR (NOT is_guest AND email IS NOT NULL AND password_hash IS NOT NULL));
CREATE INDEX IF NOT EXISTS users_guest_seen ON users (last_seen_at) WHERE is_guest;
```

`ADD CONSTRAINT` isn't idempotent, so wrap it in a `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_guest_shape') ... $$` block. Check that the block runs on both PGlite and Neon. `UNIQUE (email)` already allows many NULLs. Existing rows are all full accounts and pass the check.

`User` in `lib/db/users.ts` becomes `{ id, email: string | null, passwordHash: string | null, isGuest: boolean, createdAt, lastSeenAt }`. Callers that read `email` or `passwordHash` (sign-in, delete account, account GET) handle null.

#### Session

Guests use the same `fg_session` cookie, token format and `session_version`. Nothing in `lib/account/session.ts` changes. `currentUserId()` returns a guest's id like any other user's, so every existing route works for guests with no change: visits, lists, recs, taste, want.

- `POST /api/account/guest` (new) creates a guest if the request has no live session, then starts a session. If a live session exists (guest or full), it answers with that user and creates nothing. Clients call it right before their first write: web from the flow's first Been, Want, Not been or reaction tap; iOS likewise. Nothing calls it on page load, so a visitor who only looks around creates no row.
- `last_seen_at` is set on creation and refreshed by `requireUserId()` when it's more than a day old: one `UPDATE users SET last_seen_at = $2 WHERE id = $1 AND is_guest AND (last_seen_at IS NULL OR last_seen_at < $2 - interval '1 day')`. Full accounts skip it.
- Cookie renewal: guest tokens last the same 30 days. When a guest makes a write and the token has less than 23 days left, `startSession` reissues it, so an active guest never expires before cleanup would remove them.

#### Upgrade on sign-up

`POST /api/account/register` (existing), when the request carries a live guest session:

1. In one transaction: `UPDATE users SET email = $2, password_hash = $3, is_guest = false, session_version = session_version + 1 WHERE id = $1 AND is_guest RETURNING id`.
2. If the email is taken (unique violation): 409, "An account with that email already exists. Sign in to keep these places." The guest is untouched.
3. `startSession(userId)` with the new version. Same id, so visits, comparisons, scores, want list, skips, taste profile, predictions and AI connections all stay where they are.

With no session it creates a full account as today.

#### Sign-in from a guest session (merge)

`POST /api/account/login` (existing), when the request carries a live guest session with any data and the credentials are right, merges the guest into the account in one transaction (`lib/account/merge.ts`, tested):

- `visits`, `comparisons`: `UPDATE ... SET user_id = $account WHERE user_id = $guest`.
- `want_list`, `place_skips`: `INSERT ... SELECT ... ON CONFLICT DO NOTHING`, then delete the guest's rows.
- `predictions`: move.
- `ai_connections`: move each provider the account doesn't already have.
- `taste_profiles`, `taste_seeds`, `place_scores`: dropped for the guest. Then `refitOccasion` runs for every occasion the guest had visits in, and the taste profile is recomputed the way a visit write already does.
- Delete the guest user. `ON DELETE CASCADE` clears what's left.

The response adds `merged: { visits: number }`, and the UI says "Added 6 places to your account." With no guest data, login behaves exactly as today.

#### AI connection

A guest has a user id, so `aiOwner()` returns `{kind: "user"}` and the connection is saved sealed in `ai_connections` as for any account. It survives the upgrade (same id) and moves on merge (above). The existing "device connection moves into the account" path is unchanged and still covers people with no session at all. The flow never asks for AI. Near me shows its existing one-line "Connect ChatGPT or Grok" note once there are picks.

#### Rate limits (`lib/server/limits.ts`)

| Name | Limit | Key | Why |
| --- | --- | --- | --- |
| `guest` (new) | 10 per hour | `ipKey(req)` | Creating guests. Higher than `register` (5/h) because shared networks and phones on cellular share IPs. |
| `deckAnon` (new) | 60 per 15 min | `ipKey(req)` | `POST /api/rate/deck` with no session, so the grid loads before any user exists. |
| `writes` | unchanged (300 per 15 min) | user id | Guests are users. |
| `places`, `placesDaily` | unchanged | user id, or `ipKey` with no session | `/api/places` today requires a user. It now accepts no session and keys on IP, so the search box works before the first write. |
| `guestRated` (new, a cap rather than a window) | 200 rated places | user id | A guest with 200 rated places must save before rating more: "Save your places to keep rating." Checked in `POST /api/visits` when `is_guest`. |

#### Cleanup of abandoned guests

`deleteStaleGuests(q, now)` in `lib/db/users.ts` runs `DELETE FROM users WHERE id IN (SELECT id FROM users WHERE is_guest AND COALESCE(last_seen_at, created_at) < $1 LIMIT 200)` with `$1 = now - 30 days`. It runs after the response (`waitUntil`, as the tile refill does) from `POST /api/account/guest`, so it costs nothing extra and needs no cron. Cascades remove everything the guest owned. Places stay, because they're shared. If guest creation is ever too rare to keep up, add a daily Vercel cron at `/api/cron/guests` (free on Hobby) that calls the same function.

The Account page for a guest says: "Your places are saved on this browser for 30 days after your last visit. Save them to an account to keep them."

#### Delete

`DELETE /api/account` for a guest needs no password. Body `{}`, and it deletes the guest and ends the session. The guest's Account page shows "Delete these places" (danger, with confirm).

### 1.4 Scores out of 10 and the existing model

Today: every visit has a `reaction` (loved / fine / disliked). Within one user and occasion, each place's latest reaction sets a Gaussian prior (`BAND_PRIOR`: 8.5 / 6 / 3.5, `PRIOR_SD = 1`), comparisons are Bradley-Terry evidence, and `refitOccasion` saves the MAP scores to `place_scores`.

The change:

- **New column** `visits.rating smallint NULL CHECK (rating BETWEEN 1 AND 10)`. Null means "no fine-tune", which is every existing row.
- **Bands are fixed ranges:** `disliked` 1–4, `fine` 5–7, `loved` 8–10. The API rejects a `rating` outside its `reaction`'s band ("A rating of 9 is in Loved it, not It was fine."). The client never sends one, because the fine-tune row only offers the band's numbers and the number keys set both together. `reaction` stays required and is still the source of truth for the band, so every existing reader (taste profile, opponent picker, lists, iOS) keeps working.
- **Prior:** in `lib/scoring/refit.ts` `bands()` returns `{ reaction, rating }` from each place's latest visit. In `fitScores`, `FitItem` gains `rating: number | null`. The prior mean is `rating ?? BAND_PRIOR[reaction]`. The prior SD is `0.6` when a rating is given (the user said it outright, so comparisons move it less) and stays `1` otherwise. The `bound` term uses each item's own SD. Everything else in the fit stays as it is.
- **Comparisons** stay within the band. A Loved 8 can be compared with a Loved 10, and the picker still prefers the closest score.
- **Score shown:** the fitted score, as now. With no comparisons it equals the rating exactly (or the band prior).
- **Existing data:** valid as is. Rows with null `rating` fit exactly as before, so no scores move on deploy. Quick start's "loved, 8.5" rows stay at 8.5.
- **Taste profile** (`lib/taste/profile.ts`) already uses the fitted score when there is one, so ratings flow into taste with no change.
- **Feedback** ("We predicted 8.4, you gave 7.1") already reads the fitted score and is unchanged.
- **Dates:** the flow doesn't ask when you went. New column `visits.dated boolean NOT NULL DEFAULT true`. The flow sends today's date with `dated: false`. Lists and the place dialog show "Rated Nov 11" instead of a visit date when `dated` is false. The taste half-life uses `created_at` for these rows, which is the same day.

Tests to add: `bradley-terry.test.ts` (a rated item sits at its rating with no comparisons; a rating's SD is tighter than the band's; null rating reproduces today's numbers exactly), `refit.test.ts` (latest visit's rating wins), `types` refine (a rating outside the band is rejected).

### 1.5 API

All JSON uses the existing envelope `{ok: true, data} | {ok: false, error}` and `handle()`. Schemas go in `lib/types.ts` (shared) or beside the route. iOS mirrors them in `Core/Models` and `Core/Endpoints`, and `ios/docs/api.md` gets a section per endpoint.

#### Shared shapes (`lib/types.ts`)

```ts
export const RATING_BAND: Record<Reaction, readonly [number, number]> = { disliked: [1, 4], fine: [5, 7], loved: [8, 10] };
export const RatingSchema = z.number().int().min(1).max(10);

// VisitInputSchema gains two optional fields; old clients send neither.
export const VisitInputSchema = z.object({
  placeId: IdSchema,
  visitedOn: DaySchema,
  reaction: ReactionSchema,
  occasion: OccasionSchema,
  rating: RatingSchema.nullable().default(null),
  dated: z.boolean().default(true),
  dishes: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  note: z.string().trim().max(2000).nullable().default(null),
}).refine(inBand, { message: "That rating doesn't match the reaction.", path: ["rating"] });
// inBand: rating === null || (rating >= RATING_BAND[reaction][0] && rating <= RATING_BAND[reaction][1])
// VisitPatchSchema: same fields minus placeId, all optional. The refine runs on the merged result in editVisit.

export const WantSourceSchema = z.enum(["manual", "rec", "ask", "import", "lodestar", "rate"]);

export const ProgressSchema = z.object({
  rated: z.number().int().min(0),
  firstPicksAt: z.literal(5),
  goal: z.literal(10),
});
export type Progress = z.infer<typeof ProgressSchema>;
```

#### `POST /api/account/guest` (new)

Body `{}`. Limit `guest` by IP.

```ts
// 200
{ user: { guest: boolean; email: string | null }, created: boolean }
```

#### `GET /api/account` (changed)

```ts
{ user: null } | { user: { email: string | null; guest: boolean; createdAt: number }, progress: Progress }
```

#### `GET /api/rate/progress` (new)

No auth needed. With no session it returns `rated: 0`. Response `Progress`. Near me and the Lists toolbar use it. iOS uses it on launch to decide whether to show the flow.

#### `POST /api/rate/deck` (new)

A POST because the exclude list can be long. It's still a read. Auth: optional. Limits: `deckAnon` by IP with no session, otherwise `places` by user. `maxDuration = 60` (nearby search may refill tiles).

```ts
const DeckRequest = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.2).max(3).default(1.5),
  limit: z.number().int().min(6).max(48).default(24),
  exclude: z.array(IdSchema).max(500).default([]),   // ids already shown this session
});

type DeckPlace = {
  place: Place;
  distanceKm: number;
  guessedOccasion: Occasion;
  kind: string;          // display type: first cuisine, else amenity ("Cafe", "Bar"), title case
};
// 200
{ places: DeckPlace[]; hasMore: boolean; source: NearbySource; progress: Progress }
```

Server (`lib/rate/deck.ts`, pure ranking tested on fixtures; the DB part tested on PGlite):

1. `nearbyPlaces(lat, lng, radiusKm)` (existing, free, tile-cached).
2. Drop places the user has a visit at, has on Want to try, or skipped as Not been within 180 days, plus everything in `exclude`.
3. Rank by `likely = 0.6 * near + 0.4 * known`:
   - `near = exp(-distanceKm / 0.6)`
   - `known` in [0, 1], from free signals only: OSM `brand` or `wikidata` tag present (+0.35; chains and well-known places are where most people have been), has `opening_hours` (+0.15), has `website` (+0.15), has cuisine (+0.1), and `min(0.25, 0.05 * n)` where n is the number of distinct Forage users with a visit there, counted only when n ≥ 3 so one person's history can't be inferred.
   - `brand` and `wikidata` aren't stored today. `fromOverpass` adds them to `tags` (`brand?: string`, `wikidata?: string`; `PlaceTagsSchema` is a loose object, so old rows are fine). They fill in as tiles refresh (14 days).
4. Interleave so no more than 3 tiles in a row share an amenity, which keeps the first page from being all bars.
5. Return `limit` places and `hasMore`.

#### `POST /api/rate/skips` and `DELETE /api/rate/skips` (new)

Auth: required (the client calls `/api/account/guest` first). Limit `writes`.

```ts
const SkipBody = z.object({ placeId: IdSchema });
// POST 200 → { skip: { placeId: string; createdAt: number } }   (adding twice keeps the first)
// DELETE 200 → { removed: boolean }
```

New table:

```sql
CREATE TABLE IF NOT EXISTS place_skips (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, place_id)
);
```

Logging a visit at a skipped place deletes the skip in the same transaction.

#### Rate a place: `POST /api/visits` (existing, extended)

The request is the extended `VisitInputSchema`. The flow sends `{placeId, visitedOn: today, reaction, occasion: guessed, rating: null | n, dated: false}`. The response is unchanged: `LogResponse = { visit, score, opponent, asked }`. `visit` now includes `rating` and `dated`. Guests over the `guestRated` cap get a 403 with "Save your places to keep rating."

#### Fine-tune, occasion, details: `PATCH /api/visits/:id` (existing, extended)

The body is the extended `VisitPatchSchema`. The response adds the place's new fitted score so the UI can update without another call:

```ts
{ visit: Visit; score: number | null }
```

#### Undo a rating: `DELETE /api/visits/:id` (existing, unchanged)

#### Comparison, next pair

- The first pair comes back in the `POST /api/visits` response (`opponent`), as today.
- **Answer:** `POST /api/comparisons` (existing). Request unchanged. The response adds the new comparison's id so it can be undone, and `subjectScore` so the UI can show "now 8.7" before moving on:

```ts
type CompareStep = { id: number; score: number | null; subjectScore: number | null; opponent: Place | null; asked: number };
```

- **Next pair after an undo or a reload:** `GET /api/comparisons/next?placeId=<uuid>&occasion=<occasion>&asked=<0..2>` (new). It wraps `nextOpponent` and returns `{ score: number | null; opponent: Place | null; asked: number }`, with `opponent: null` when `asked >= MAX_COMPARISONS`.
- **Undo an answer:** `DELETE /api/comparisons/:id` (new). It deletes the user's own comparison (404 otherwise), refits that occasion and returns `{ score: number | null }` for the subject place, read from the query string `?placeId=`.

#### Places search: `GET /api/places` (changed)

It accepts requests with no session, keyed by IP for limits, as above. The response is unchanged.

### 1.6 Files

Web:

| File | What |
| --- | --- |
| `app/rate/page.tsx` | Server page. Renders `RateFlow` with no nav chrome except Close and Undo. |
| `app/page.tsx` | Redirect to `/rate` per the entry rule. |
| `components/rate/rate-flow.tsx` | Step state machine (`pick` → `rate` → `compare` → `finish`) and the undo stack. Under 200 lines. |
| `components/rate/pick-grid.tsx`, `place-tile.tsx` | Step A. |
| `components/rate/rate-card.tsx` | Step B. It replaces `components/log/visit-form.tsx` everywhere (see Part 2). |
| `components/rate/compare-pair.tsx` | Step C. Moved and renamed from `components/log/compare-step.tsx`, with Too tough and the score line. |
| `components/rate/finish.tsx`, `save-panel.tsx`, `progress.tsx`, `rate-prompt.tsx` | |
| `components/rate/use-rate-keys.ts`, `undo.ts` (+ `undo.test.ts`) | |
| `lib/rate/occasion.ts` (+ test), `lib/rate/deck.ts` (+ test), `lib/rate/progress.ts` | |
| `lib/account/guest.ts`, `lib/account/merge.ts` (+ tests) | |
| `lib/db/skips.ts` (+ test) | |
| `app/api/account/guest/route.ts`, `app/api/rate/deck/route.ts`, `app/api/rate/skips/route.ts`, `app/api/rate/progress/route.ts`, `app/api/comparisons/next/route.ts`, `app/api/comparisons/[id]/route.ts` | |

iOS (`ios/Forage/Features/Rate/`, tests under `ios/ForageTests/Rate/`):

- `RateFlowView` (full-screen cover, same steps), `PickGridView` (`LazyVGrid`, 2 columns), `RateCardView`, `ComparePairView`, `RateFinishView`, `SavePanelView`, `RateModel` (`@Observable`, holds the steps and undo stack), `OccasionGuess.swift` (port of `lib/rate/occasion.ts` with the same test cases).
- `RootView`: show the cover on launch per 1.2. The signed-out `SignInPrompt` on every tab is replaced: with no session, Near me shows the rate prompt card, and Lists shows "Rate places you've been" with the same button.
- `Core/Endpoints`: `API.Rate.deck/progress/skip/unskip`, `API.Account.guest`, `Comparisons.next/delete`, and the changes to `Visits`.
- Location: `LocationService.requestFix()` is called only from Step A after the one-line reason. `NSLocationWhenInUseUsageDescription` changes to "Forage lists places near you to rate and recommend. Your location isn't saved."
- Haptics: `.sensoryFeedback(.selection)` on Been toggles, `.success` on a saved rating.
- `CookieVault` already keeps `fg_session` in the Keychain, so a guest survives relaunch.

### 1.7 Out of scope here

Google Maps Takeout import (the earlier design lists it; when built, starred places come in as Want to try, and "Been" from Takeout goes through Step B so they get a real rating, which avoids Beli's import complaint). Friends, invites and contacts: none, by rule.

---

## Part 2. Web cleanup

### 2.1 What I saw

Run: `pnpm dev` on port 3417 with `pglite://memory`, a seeded account with 7 visits (2 comparisons) and 1 Want to try near Civic Center, San Francisco. Every page was screenshotted at 1280×900 and 390×844, signed in and signed out.

| # | Where | Problem | Severity |
| --- | --- | --- | --- |
| 1 | Nav, phone | Six tabs don't fit at 390 px. The bar shows "Near me Explore Lists L" and Log, Ask and Account are scrolled off with no hint they exist. Account (sign in) is the hardest to find. | High |
| 2 | Every tab, signed out | Near me, Lists, Log and Ask all dead-end at "Sign in". A new visitor can't do anything without making an account first. | High (fixed by Part 1) |
| 3 | Near me | 30 picks in one column. With 7 visits the scores are almost flat (5.5–6.1), so the list reads as noise. The page is 4,100 px tall on desktop and 4,900 px on phone. | High |
| 4 | Near me | A pick row can't be opened. There's no Want to try and no place details, only "Log a visit". Lists has a place dialog, but Near me doesn't use it. | High |
| 5 | Near me | The facts line is often just a distance ("290 m"), because most OSM places have no cuisine. The address repeats "San Francisco, California, United States" on every row. | Medium |
| 6 | Near me | The location row says "Near Your location" with a "Use my location" button even when the location is already in use. | Medium |
| 7 | Near me | "Your taste" sits under 30 picks, where nobody will see it. Likes and dislikes show `amenity:` tags ("Likes bar, restaurant · Dislikes cafe"), which reads like a bug. | Medium |
| 8 | Lists | The lede says "ranked within each occasion", but "All" ranks every occasion together 1–7. Starbucks (Quick bite, 8.5) sits above Café Valor (Casual, 8.2) as if they were compared. | Medium |
| 9 | Lists, desktop | The map draws 320 px tall inside a 520 px frame, which leaves an empty block under it. MapLibre isn't resized to its container. | Medium |
| 10 | Lists, phone | The map comes first and pushes the list below the fold. Addresses get cut off mid-word ("San Franci…"). | Medium |
| 11 | Lists | Two entry buttons, "Quick start" and "Log a visit", sit beside the tabs. Quick start is an onboarding tool that stays forever. | Low |
| 12 | Log | The page is a search box and nothing else. You have to type, or know to press "Near me". | Medium |
| 13 | Explore | Mostly empty. The mode choice (Travel, Splurge, Stretch), which is what makes the page useful, is hidden until an area is picked. "Connect Lodestar" takes the whole right column for people who don't use Lodestar. | Medium |
| 14 | Ask | Without AI connected, the whole tab is one sentence and a link. It's a tab that most new users can't use. | Medium |
| 15 | Account | Fine, but the theme toggle lives in the nav while every other setting is here. The taste summary, which is a setting, lives on Near me. | Low |
| 16 | Everywhere | Three verbs for one thing: "Log a visit", "Quick start", "Add places you love". | Medium |
| 17 | Components | Link-styled-as-button classes are copied in `lists-view.tsx` (`linkButton`), `sign-in-note.tsx`, `near-me.tsx` and `quick-start.tsx`. Two filter styles: `Pill` (rounded-full, Lists) and `Segmented` (Near me, Log). Loading uses `skeleton` in some places and `animate-pulse bg-hover` in Lists. Place rows are built four times (`RecList`, `BeenList`, `WantList`, `PlaceSearch`). | Low (maintenance) |

### 2.2 Navigation

The target is four destinations plus one global action, the same on web and iOS.

| | Desktop (≥ 720 px): top bar | Phone (< 720 px) |
| --- | --- | --- |
| Left | Wordmark | Top bar: wordmark, then `+ Rate` (icon + label) on the right |
| Tabs | Near me · Explore · Lists | Bottom tab bar, 64 px plus the safe area: Near me · Explore · Lists · You |
| Right | `+ Rate` button (ghost, the only button in the bar), then "You" (account; shows "Save places" for a guest, "Sign in" with no session) | — |

- **Log becomes the global `+ Rate` action.** It opens a sheet on phone and a dialog on desktop: search plus nearby places, then the same `RateCard` from Part 1. `/log` and `/log?place=` still work and open the same thing as a full page for deep links.
- **Ask moves into Near me** as a single input at the top of the picks: "What are you in the mood for?" With AI connected it calls `/api/recs/ask` and shows the three picks above the regular list. Without AI, focusing it shows one line: "Ask uses your own ChatGPT or Grok. Connect one in You." `/ask` redirects to `/?ask=1`, which focuses the input.
- **Account is renamed "You"** (route stays `/account`). It gets "Your taste" (moved from Near me), the theme choice (moved from the nav: System, Light, Dark as a `Segmented`), AI, Lodestar, Sessions and Delete, in that order.
- **Quick start is retired.** `/log/quick` redirects to `/rate`. The README's "New accounts can start from `/log/quick`" becomes `/rate`.
- `components/nav.tsx` splits into `top-bar.tsx` and `tab-bar.tsx` with a shared `TABS` (3 entries plus You). The active state stays the accent underline on desktop. On the bottom bar it's ink text plus a 2 px accent bar above the label. Icons are Lucide `MapPin`, `Compass`, `List`, `User`, at 20 px.

### 2.3 Page by page

#### Near me (`/`)

Order, top to bottom:

1. Rate prompt card (Part 1). Shown while rated < 10, before the picks.
2. Location row: "Near **Civic Center**" (reverse-geocoded label; Photon reverse is free and already used) and a "Change" text button that opens the existing area search. "Use my location" shows only while there's no location. Add "Rate places" (ghost) at the right end of this row.
3. Ask input (above).
4. Picks. `Segmented` Something new / Go-to, as now. Show **10** picks, then "Show 10 more". Under 5 rated: no picks, just the line from Part 1.
5. Remove `TastePanel` from this page (it moves to You).

Pick row (one shared `PlaceRow`, below):

- Line 1: name (16 px medium), score at right (mono 20 px). Under 10 rated, the score is drawn in `text-mute` with a title "Rough until you've rated 10 places".
- Line 2 (13 px mute): `kind · price · distance · street`, where `kind` is the first cuisine or else the amenity in title case ("Bar", "Cafe"), and `street` is the address up to the first comma (helper `shortAddress(place)` in `lib/places/format.ts`, tested).
- Line 3: the AI reason when there is one, as now.
- Actions on the right of line 2 (text buttons, 44 px touch): "Want to try" (toggles, shows "Saved"), "Been? Rate it" (opens the `+ Rate` sheet on this place).
- The whole row (outside the buttons) opens `PlaceDialog`, the same one Lists uses.

#### Lists (`/lists`)

- Header row: tabs Been / Want to try on the left. On the right, one accent button "Rate places" (goes to `/rate`). Remove "Quick start" and "Log a visit" (the global `+ Rate` covers single places).
- Occasion filter: use `Segmented` (scrolls sideways on phone) in place of `Pill`, the same control as Near me. Default to **All**.
- In **All**, drop the rank numbers and group rows under per-occasion subheads (`SectionRule` with the occasion and its count), each ranked 1..n. That makes the lede true. Inside a single occasion, rank numbers show as now.
- Rows use `PlaceRow`. Line 2: `kind · street`; line 3 (mono 12): `Loved · Oct 2` or `Loved · Rated Nov 11` when `dated` is false. Drop the trailing occasion in All, since the subhead says it.
- Map, desktop: fix the height. The map container must fill the 520 px frame. Call `map.resize()` from a `ResizeObserver` on the container in `components/map/place-map.tsx` and make the inner div `h-full`. Check that the map fills its frame at 1280 px after load and after switching tabs.
- Map, phone: replace the stacked map with a `Segmented` "List | Map" toggle under the filter. List is the default. The chosen view is remembered in `localStorage` (`forage.lists.view`, wrapped in try/catch).
- Empty states: Been → "Nothing rated yet." + "Rate places near you" (ghost link to `/rate`). Want → "Nothing saved yet. Tap Want to try on any pick." Filtered occasion with none → "No quick bites rated yet."

#### `+ Rate` sheet / `/log`

- Opens on "Places near you" (the same nearby list the search's "Near me" button shows today) as soon as location is available, so you can tap without typing. The search box sits above it, autofocused on desktop only.
- Picking a place opens `RateCard`: three buttons, occasion, fine-tune, "Add details" (date, dishes, note). Comparisons follow (up to 2), then the score.
- After saving: "Saved · 8.7" with "Rate another" and "Done". On desktop, Done closes the dialog. On phone it closes the sheet.

#### Explore (`/explore`)

- One row: area search (wide) and `Segmented` mode Travel / Splurge / Stretch, both visible at once. Default Travel. A one-line description of the chosen mode sits under the control ("Splurge: special-occasion places, no price limit.").
- Lodestar trips: if linked, show them as chips under the search ("Lisbon · Dec 3–9"). If not linked, show one quiet line under the search: "Plan around a trip? Connect Lodestar in You." Drop the right column.
- Recent areas: the last 3 areas picked, as chips, in `localStorage` (`forage.explore.recent`).
- Results use `PlaceRow` with "Add to trip" when a trip is picked. Same 10 + "Show more" rule as Near me.

#### You (`/account`)

Sections in this order, each a `SectionRule`:

1. **Account**. Signed in: email and "Joined". Guest: the save form and the 30-day line from 1.3. No session: sign-in and create-account forms.
2. **Your taste**: the summary (editable), likes and dislikes, and "Update from my places". Likes and dislikes leave out `amenity:` keys (the source of "Likes bar, restaurant") and `occasion:` keys, and keep cuisine, dish, vibe, price and attribute keys. That filter goes in `lib/taste/view.ts`, with a test.
3. **Appearance**: System / Light / Dark.
4. **AI**, 5. **Lodestar**, 6. **Sessions**, 7. **Delete account**: as now.

#### Reset (`/reset`)

No change.

### 2.4 Components to unify

| New or changed | Replaces | Notes |
| --- | --- | --- |
| `ButtonLink` in `components/ui.tsx` | `linkButton` in `lists-view.tsx`, the inline classes in `sign-in-note.tsx`, `near-me.tsx`, `quick-start.tsx`, `log-flow.tsx` | Same variants as `Button` (`accent`, `ghost`, `quiet`), wrapping `next/link`. |
| `PlaceRow` in `components/place-row.tsx` | Row markup in `RecList`, `BeenList`, `WantList`, `PlaceSearch` | Props: `place`, `kind`, `meta` (line 2 extras), `score?: { value, muted }`, `rank?`, `reason?`, `actions?: ReactNode`, `onOpen?`. Hairline bottom border, 16 px vertical padding, 44 px minimum touch height. |
| `ScoreText` | The four inline `toFixed(1)` + mono spans | Sizes `sm` (14), `md` (20), `lg` (32). Always `tabular-nums`, always an `aria-label` "8.7 out of 10". |
| `Segmented` (moved from `components/log/` to `components/ui/segmented.tsx`) | `Pill` in `lists-view.tsx` | Gains horizontal scroll on overflow. |
| `Skeleton` | `animate-pulse bg-hover` in Lists | Use the existing `.skeleton` class everywhere. |
| `EmptyState` | `SignInNote` | `SignInNote` is deleted once the guest path removes the signed-out dead ends. |
| `RateCard` | `components/log/visit-form.tsx`, `components/log/quick-start.tsx` | |
| `shortAddress`, `placeKind` in `lib/places/format.ts` | `placeLine` in `components/lists/been.ts`, `facts` in `rec-list.tsx` | Tested. |

### 2.5 Copy

| Where | Now | New |
| --- | --- | --- |
| Verb for adding a place | "Log a visit", "Quick start", "Add places you love" | "Rate" everywhere: `+ Rate`, "Rate places", "Been? Rate it". The detailed form is "Add details" inside it. |
| Reactions | "Loved it", "It was fine", "Didn't like it" | Keep (already plain, and iOS matches). |
| Near me lede | "Picks around you, based on where you've eaten." | Keep. |
| Lists lede | "Places you've been, ranked within each occasion, and places you want to try." | "Places you've rated, ranked within each occasion, and places you want to try." |
| Near me, no picks yet | "Sign in to get picks based on the places you have eaten." | "Rate 5 places to get picks." |
| Near me, empty "new" | "Nothing new within 2 km yet. Try another place, or check back once the map has loaded more spots." | "Nothing new within 2 km. Try another area." |
| Near me AI note | "Scores come from your history. Connect ChatGPT or Grok to get a reason with each pick." | "Connect ChatGPT or Grok in You to get a reason with each pick." |
| Taste empty | "No summary yet. Log a few places, then update it." | "No summary yet. Rate a few places, then update it." |
| Location row | "Near · Your location · Use my location · Pick a place" | "Near Civic Center · Change" |
| Explore lede | "Pick a city, a neighborhood or one of your Lodestar trips, then a mode." | "Picks for anywhere you're going." |
| Ask lede | — (page removed) | Input placeholder: "What are you in the mood for?" |

### 2.6 Order of work

Each step ships on its own and leaves the app working.

1. **Guest users and the rate flow** (Part 1: schema, API, `/rate`, Near me prompt card, entry redirect). This removes finding 2 and is the owner's main ask.
2. **Navigation** (2.2). Fixes finding 1, the worst usability problem on phones. Retire `/log/quick`, fold Ask into Near me, rename Account to You.
3. **`PlaceRow`, `ScoreText`, `ButtonLink`, `shortAddress`/`placeKind`** (2.4), then Near me (findings 3–7) and Lists (8–11) on top of them.
4. **`+ Rate` sheet** (finding 12) using `RateCard`.
5. **Explore** (finding 13) and **You** (finding 15).
6. Copy pass (2.5) and README and `ios/docs/api.md` updates.

iOS follows the same order. Step 2 mostly applies already (iOS has Log as a sheet and four real tabs plus Ask). On iOS, Ask moves into Near me the same way, and Lists gets the "Rate places" toolbar button.

### 2.7 How to check each step

- `pnpm typecheck && pnpm lint && pnpm test` and `pnpm build`.
- New unit tests: `lib/rate/occasion.test.ts`, `lib/rate/deck.test.ts`, `lib/account/guest.test.ts`, `lib/account/merge.test.ts`, `lib/db/skips.test.ts`, `components/rate/undo.test.ts`, `lib/places/format.test.ts`, and additions to `bradley-terry.test.ts`, `refit.test.ts` and `lib/taste/view` tests.
- Manual: run locally as above. Screenshot `/rate`, `/`, `/lists`, `/explore` and `/account` at 1280 and 390, signed out, as a guest with 3 and with 6 rated, and signed in. Confirm at 390 that all four destinations and `+ Rate` are visible without scrolling the nav, and that no page scrolls sideways.
- Guest path, by API: create a guest, rate 6, register, and confirm the same user id has 6 visits. Create a second guest, rate 2, sign in to the first account, and confirm 8 visits and that the guest row is gone. Set a guest's `last_seen_at` back 31 days, create another guest, and confirm the old one is deleted.
- iOS: `xcodegen generate`, then build and test with `-derivedDataPath /tmp/forage-ios-dd-rate`. Use one simulator and shut it down afterwards.
