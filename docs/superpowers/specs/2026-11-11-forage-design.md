# AI restaurant recommendations (working name TBD): research and draft plan

Draft, 2026-11-11. Nothing is built. Items marked **(my call)** are defaults you can overturn.

## 1. How Beli actually recommends

Beli doesn't publish its formula. From the app, the founders' interviews and independent write-ups:

- **Capture:** you pick a tier (liked it / fine / didn't), then answer a few "this or that?" comparisons against places already on your list. That inserts the place into one ordered list, which is mapped to a 0–10 score. Write-ups describe it as Elo-like insertion.
- **Rec Score:** after about 15 ranked places, Beli predicts your score for places you haven't been. It looks for users anywhere with similar rankings (collaborative filtering), with friends weighted in. Shown next to a **Friend Score** (average of people you follow).
- **Everything else is social:** feed, leaderboards, invite walls, and since Oct 2026 Resy booking inside the app. 130M+ ratings is the moat.

## 2. Where Beli falls short (from reviews, Reddit, press)

1. **One list for everything.** A taco truck gets compared to an omakase. Users ask for tiers by occasion.
2. **Cheap places score low,** and the nearby map hides anything under ~8.0, so it skews expensive.
3. **Ranking is a chore.** Several comparisons per entry; scores drift as the list grows.
4. **Recs feel "mid" and unexplained.** No reason given, no way to say what you want tonight.
5. **Not a map or travel tool.** Users type a city and sort by score as a workaround.
6. **Needs a big network.** Collaborative filtering and friend scores are useless for a new app with few users, and invite walls annoy people.

Point 6 matters most for us: we can't copy Beli's engine because we have no crowd. AI is what makes recommendations work from day one.

## 3. The approach: taste profile + live candidates + AI that can only pick real places

**Capture (faster than Beli)**
- Log a visit with one tap on a 3-level reaction, an **occasion** (quick bite / casual / night out / special) and optional dishes.
- At most two comparisons, and only against places in the **same occasion**. Scores per occasion come from a Bradley-Terry model, and the app picks the comparison that tells it the most.
- Cold start without ranking 15 places: pick places you love on a map, import Google Maps starred places (Takeout), and pull past restaurant bookings from Lodestar Trips (it already reads Resy/OpenTable confirmations).

**Taste profile**
- Each place gets a feature card: cuisine, dishes, price, vibe, occasion, attributes. Stored as an embedding.
- Your profile = weighted embeddings of your rated places, plus a **plain-English taste summary** the AI writes and you can edit ("loves hand-pulled noodles and natural wine bars, dislikes scene-y spots").

**Recommending**
1. Candidates: real places near the chosen point (open now, within distance or travel time).
2. Fast scoring: taste similarity + quality prior (crowd rating, adjusted for review count) + distance + novelty. Collaborative filtering gets added once there are users.
3. AI rerank of the top ~30 with your taste summary and what you said you want ("spicy, under $30, two people"). Each pick comes with one line of reasoning that cites your own places ("like Mian, but brothier").
4. Same rule as Lodestar's Plan: the model can only cite candidates by ID, so it can't invent a restaurant or a price.
5. Feedback: after you go, show "we predicted 8.4, you gave 7.1" and recalibrate.

## 4. Tabs

- **Near me:** daily use. Recs around you, based on where you've eaten. Filters for "go-to" vs "something new".
- **Explore:** pick any place (a city, a neighborhood, or a Lodestar trip) and a mode: **Travel**, **Splurge** (budget ceiling lifted, special-occasion places only), **Stretch** (a cuisine you haven't tried, close to what you like).
- **Been / Want to try:** your list and map, split by occasion.
- **Ask:** describe tonight in words and get 3 picks with reasons.

## 5. Connecting to Lodestar

Lodestar already has accounts, an OAuth server with PKCE, MCP tools for trips, food/dietary/budget preferences, the Google Places key, a dining planner and a SwiftUI iOS app.

- **Separate accounts, one-tap link (your call):** the app has its own logins. "Connect Lodestar" opens Lodestar's existing OAuth consent page (PKCE, public client via Client ID Metadata Document); the app stores the refresh token and talks to Lodestar's MCP/API with it. Disconnect from either side.
- **Reverse direction (my call):** Lodestar's "Plan dining" needs a way to ask this app for picks. Simplest: the link also hands Lodestar a scoped token for this app's `/api/picks` endpoint. Can wait until phase 3.
- **Trip → Explore:** your Lodestar trips appear in Explore with their city and dates already filled in. One button adds a pick to a trip day through the existing `add_items` operation.
- **Lodestar → taste:** Lodestar's "Plan dining" asks this app for picks when the account is linked, so trip meal plans use your real taste rather than a cuisine checklist.
- **Been prompts:** a Resy/OpenTable booking that Lodestar filed becomes "you ate at X, how was it?" here.
- **Seed:** cuisines, dietary and budget preferences come over from Lodestar at first sign-in.

## 6. Stack **(my call, matching Lodestar)**

- Web: Next.js on Vercel, Neon Postgres with **pgvector** for embeddings, Resend email, push deploys from a public MIT repo.
- iOS: SwiftUI, iOS 26, XcodeGen, no third-party packages, same `/api/*` approach as Lodestar's app.
- AI: all of it through `@neelsatyavolu/shared-ai-auth` (your call): the user's own ChatGPT or Grok. No server AI key. Without a connection, Near me still works on the plain scoring step; reasons, Ask and the rerank need AI connected.
- No embeddings **(my call)**, since shared-ai-auth has no embedding endpoint: feature cards are structured tags (cuisine, dishes, price, occasion, vibe, attributes) and the taste profile is weights over those tags. The connected AI writes the cards and does the nuanced matching in the rerank.
- Place data: Google Places (New) for live details. Google's terms only allow storing place IDs (and coordinates for 30 days), so stored feature cards come from **Foursquare Open Source Places / Overture** (open licence) plus our own AI-written descriptions.

## 7. Phases

1. **Log and list:** accounts via Lodestar, search a place, log it with occasion and reaction, Been/Want lists and map. Web first.
2. **Taste engine:** feature cards, embeddings, scoring, Near me with reasons, feedback loop. Offline test: hide 20% of your own logs and check whether they rank near the top.
3. **Explore:** any location, Travel/Splurge/Stretch modes, Lodestar trips, add to trip.
4. **iOS app.**
5. **Social (later, your call: solo first):** friends, friend scores, then collaborative filtering once there are enough users.

## Decided 2026-11-11

- Separate product with its own accounts; one-tap Connect Lodestar.
- AI through shared-ai-auth only.
- Solo taste engine first; social later.

## Still open

- Name and domain (xanom.co subdomain like the others?).

## Build decisions (2026-11-11)

- Name **Forage**, at forage.xanom.co. Folder `~/Documents/GitHub/forage`.
- Stack mirrors Lodestar: Next.js 16 + React 19, Tailwind 4, zod, `pg` (Neon in production, PGlite in `.data/` locally), vitest, pnpm, `@neelsatyavolu/shared-ai-auth` pinned to the same commit as Lodestar. Design follows `~/DESIGN.md`.
- Place data v1 **(my call)**: OpenStreetMap (Overpass for nearby restaurants, Photon for search) is the stored catalog (ODbL allows storing). Google Places (New) adds live rating/price/hours/photo when `GOOGLE_PLACES_KEY` is set; only the Google place id is stored. Foursquare OS Places is a later upgrade.
- Scores: Bradley-Terry per user per occasion, refit on every comparison, mapped to 0–10.
- Lodestar link: Forage is an OAuth public client of Lodestar, identified by a Client ID Metadata Document at `https://forage.xanom.co/oauth/client-metadata.json`, PKCE S256. Tokens sealed (AES-GCM) in Forage's DB. Forage calls Lodestar's MCP endpoint (`/api/mcp`, tools `list_trips`, `get_trip`, `add_items`). Lodestar itself is not modified in this phase.
- iOS app comes after the web app's API settles (phase 4, separate run).
