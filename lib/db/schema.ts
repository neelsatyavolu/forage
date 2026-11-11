import type { Queryable } from "./client";

// Idempotent statements, run in order on every start. Later changes go at
// the end as ALTERs so existing databases catch up.
//
// Places are shared by everyone (one row per OSM node or manual entry). Every
// other table holds one user's data and is scoped by user_id, deleted with
// the account (ON DELETE CASCADE).
//
// Scores and predictions are double precision, not numeric, so both drivers
// return them as JS numbers.
const ACCOUNT_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    session_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL
  )`,
  // Reset links sent and not yet used. Only a hash of each token is kept.
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count integer NOT NULL
  )`,
  // AI sign-ins (ChatGPT, Grok) made while signed in, sealed by lib/ai/session.
  `CREATE TABLE IF NOT EXISTS ai_connections (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider text NOT NULL,
    sealed text NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, provider)
  )`,
];

const PLACE_TABLES = [
  `CREATE TABLE IF NOT EXISTS places (
    id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('osm', 'manual')),
    source_id text NOT NULL,
    google_place_id text,
    name text NOT NULL,
    lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
    address text,
    city text,
    country text,
    cuisine text[] NOT NULL DEFAULT '{}',
    price_level smallint CHECK (price_level BETWEEN 1 AND 4),
    tags jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL,
    UNIQUE (source, source_id)
  )`,
  `CREATE INDEX IF NOT EXISTS places_lat_lng ON places (lat, lng)`,
  `CREATE INDEX IF NOT EXISTS places_google ON places (google_place_id) WHERE google_place_id IS NOT NULL`,
];

const USER_TABLES = [
  `CREATE TABLE IF NOT EXISTS visits (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    visited_on date NOT NULL,
    reaction text NOT NULL CHECK (reaction IN ('loved', 'fine', 'disliked')),
    occasion text NOT NULL CHECK (occasion IN ('quick', 'casual', 'night_out', 'special')),
    dishes text[] NOT NULL DEFAULT '{}',
    note text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS visits_user ON visits (user_id, visited_on DESC)`,
  `CREATE INDEX IF NOT EXISTS visits_user_place ON visits (user_id, place_id)`,
  `CREATE TABLE IF NOT EXISTS comparisons (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    winner_place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    loser_place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    occasion text NOT NULL CHECK (occasion IN ('quick', 'casual', 'night_out', 'special')),
    created_at timestamptz NOT NULL,
    CHECK (winner_place_id <> loser_place_id)
  )`,
  `CREATE INDEX IF NOT EXISTS comparisons_user ON comparisons (user_id, occasion)`,
  `CREATE TABLE IF NOT EXISTS place_scores (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    occasion text NOT NULL CHECK (occasion IN ('quick', 'casual', 'night_out', 'special')),
    score double precision NOT NULL CHECK (score BETWEEN 0 AND 10),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, place_id, occasion)
  )`,
  `CREATE TABLE IF NOT EXISTS want_list (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL,
    source text NOT NULL,
    PRIMARY KEY (user_id, place_id)
  )`,
  `CREATE TABLE IF NOT EXISTS taste_profiles (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    weights jsonb NOT NULL DEFAULT '{}'::jsonb,
    summary text NOT NULL DEFAULT '',
    summary_edited boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS predictions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    place_id uuid NOT NULL REFERENCES places (id) ON DELETE CASCADE,
    predicted double precision NOT NULL CHECK (predicted BETWEEN 0 AND 10),
    actual double precision CHECK (actual BETWEEN 0 AND 10),
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS predictions_user_place ON predictions (user_id, place_id, created_at DESC)`,
  // Lodestar account link: OAuth tokens sealed (AES-GCM) with FORAGE_SECRET, never stored readable.
  `CREATE TABLE IF NOT EXISTS lodestar_links (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    sealed_tokens text NOT NULL,
    lodestar_user_label text,
    created_at timestamptz NOT NULL
  )`,
];

// The prediction before the user's calibration offset was added. Calibration
// is fitted on actual minus this, so the offset doesn't feed back on itself.
// Null on rows from before the column existed.
const LATER = [
  `ALTER TABLE predictions ADD COLUMN IF NOT EXISTS raw_predicted double precision CHECK (raw_predicted BETWEEN 0 AND 10)`,
  // Map tiles (lib/places/tiles) whose OpenStreetMap places were last fetched
  // from Overpass at fetched_at. The places themselves are in `places`.
  `CREATE TABLE IF NOT EXISTS osm_tiles (
    tile text PRIMARY KEY,
    fetched_at timestamptz NOT NULL
  )`,
];

const STATEMENTS = [...ACCOUNT_TABLES, ...PLACE_TABLES, ...USER_TABLES, ...LATER];

export async function migrate(db: Queryable): Promise<void> {
  for (const sql of STATEMENTS) await db.query(sql);
}
