import { createPgliteDb, type Db } from "../lib/db/client";
import { upsertPlace } from "../lib/db/places";
import { migrate } from "../lib/db/schema";
import { insertUser } from "../lib/db/users";
import type { Place, PlaceInput } from "../lib/types";

// Test helpers: a fresh in-memory database with the schema, users and places.

export const USER_A = "00000000-0000-4000-8000-00000000000a";
export const USER_B = "00000000-0000-4000-8000-00000000000b";

export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  await insertUser(db, { id: USER_A, email: "a@example.com", passwordHash: "x", createdAt: 1 });
  await insertUser(db, { id: USER_B, email: "b@example.com", passwordHash: "x", createdAt: 1 });
  return db;
}

export const placeInput = (overrides: Partial<PlaceInput> = {}): PlaceInput => ({
  source: "osm",
  sourceId: "node/1",
  googlePlaceId: null,
  name: "Mian",
  lat: 37.77,
  lng: -122.42,
  address: "1 Main St",
  city: "San Francisco",
  country: "US",
  cuisine: ["chinese", "noodles"],
  priceLevel: 2,
  tags: { dishes: ["dan dan noodles"] },
  ...overrides,
});

export async function addPlace(db: Db, overrides: Partial<PlaceInput> = {}): Promise<Place> {
  return upsertPlace(db, placeInput(overrides), 1000);
}
