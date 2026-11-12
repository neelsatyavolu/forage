import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPlace, freshDb } from "@/test/db";
import { call, data, params, request, state } from "@/test/routes";
import type { Place } from "@/lib/types";

// Route-level checks of the rating flow: a visitor with no account loads the
// deck, becomes a guest on the first write, rates, compares, undoes, and saves.

process.env.FORAGE_SECRET = "route-test-secret-0123456789";

vi.mock("next/headers", async () => {
  const { cookieStore, state } = await import("@/test/routes");
  return { cookies: async () => cookieStore(state.jar) };
});
vi.mock("@/lib/db/client", async (importOriginal) => {
  const { state } = await import("@/test/routes");
  return { ...(await importOriginal<object>()), getDb: async () => state.db };
});
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => void p.catch(() => {}) }));
vi.mock("@/lib/places", async () => {
  const { state } = await import("@/test/routes");
  return {
    nearbySearch: async () => ({ places: state.db ? await allPlaces() : [], source: "cache" }),
  };
});

async function allPlaces(): Promise<Place[]> {
  const { getPlaces } = await import("@/lib/db/places");
  const ids = (await state.db!.query<{ id: string }>("SELECT id FROM places")).map((r) => r.id);
  return getPlaces(state.db!, ids);
}

const deck = await import("./deck/route");
const skips = await import("./skips/route");
const progress = await import("./progress/route");
const guest = await import("../account/guest/route");
const account = await import("../account/route");
const register = await import("../account/register/route");
const login = await import("../account/login/route");
const visits = await import("../visits/route");
const visit = await import("../visits/[id]/route");
const comparisons = await import("../comparisons/route");
const comparison = await import("../comparisons/[id]/route");
const next = await import("../comparisons/next/route");

const AT = { lat: 37.77, lng: -122.42 };
let places: Place[];

beforeEach(async () => {
  state.db = await freshDb();
  state.jar = new Map();
  places = await Promise.all(
    ["cafe", "bar", "diner", "sushi"].map((n, i) =>
      addPlace(state.db!, { sourceId: `node/${n}`, name: n, lat: AT.lat + i * 0.001, lng: AT.lng, cuisine: [], tags: { attributes: [n === "cafe" ? "cafe" : n === "bar" ? "bar" : "restaurant"] } }),
    ),
  );
});

type Deck = { places: { place: Place; distanceKm: number; guessedOccasion: string; kind: string }[]; hasMore: boolean; source: string; progress: { rated: number } };
type Logged = { visit: { id: string; rating: number | null; dated: boolean }; score: number | null; opponent: Place | null; asked: number };
const rate = (placeId: string, reaction: string, rating: number | null = null) =>
  visits.POST(request("POST", "/api/visits", { placeId, visitedOn: "2026-11-11", reaction, occasion: "casual", rating, dated: false }));

describe("rating flow routes", () => {
  it("serves the deck with no session and creates no user", async () => {
    const d = await data<Deck>(deck.POST(request("POST", "/api/rate/deck", { ...AT, limit: 6 })));
    expect(d.places.map((p) => p.place.name)).toEqual(["cafe", "bar", "diner", "sushi"]);
    expect(d.places[0]).toMatchObject({ guessedOccasion: "quick", kind: "Cafe" });
    expect(d.places[1].guessedOccasion).toBe("night_out");
    expect(d).toMatchObject({ hasMore: false, source: "cache", progress: { rated: 0, firstPicksAt: 5, goal: 10 } });
    expect(await state.db!.query("SELECT 1 FROM users WHERE is_guest")).toEqual([]);
    expect(await data(progress.GET(request("GET", "/api/rate/progress")))).toEqual({ rated: 0, firstPicksAt: 5, goal: 10 });
  });

  it("validates the deck request", async () => {
    const { status } = await call(deck.POST(request("POST", "/api/rate/deck", { ...AT, limit: 100 })));
    expect(status).toBe(400);
  });

  it("needs a session to write; the guest endpoint makes one once", async () => {
    expect((await call(skips.POST(request("POST", "/api/rate/skips", { placeId: places[0].id })))).status).toBe(401);
    expect(await data(guest.POST(request("POST", "/api/account/guest")))).toEqual({ user: { guest: true, email: null }, created: true });
    expect(await data(guest.POST(request("POST", "/api/account/guest")))).toEqual({ user: { guest: true, email: null }, created: false });
    expect(await state.db!.query("SELECT 1 FROM users WHERE is_guest")).toHaveLength(1);
    const acct = await data<{ user: { guest: boolean; email: null }; progress: { rated: number } }>(account.GET(request("GET", "/api/account")));
    expect(acct).toMatchObject({ user: { guest: true, email: null }, progress: { rated: 0 } });
  });

  it("skips, undoes a skip, and keeps skipped and rated places out of the deck", async () => {
    await data(guest.POST(request("POST", "/api/account/guest")));
    const skip = await data<{ skip: { placeId: string } }>(skips.POST(request("POST", "/api/rate/skips", { placeId: places[0].id })));
    expect(skip.skip.placeId).toBe(places[0].id);
    await data(rate(places[1].id, "loved", 9));
    const d = await data<Deck>(deck.POST(request("POST", "/api/rate/deck", { ...AT, exclude: [places[2].id] })));
    expect(d.places.map((p) => p.place.name)).toEqual(["sushi"]);
    expect(d.progress.rated).toBe(1);
    expect(await data(skips.DELETE(request("DELETE", "/api/rate/skips", { placeId: places[0].id })))).toEqual({ removed: true });
    expect((await call(skips.POST(request("POST", "/api/rate/skips", { placeId: "00000000-0000-4000-8000-000000000999" })))).status).toBe(404);
  });

  it("rates, fine-tunes, compares, undoes, and asks again", async () => {
    await data(guest.POST(request("POST", "/api/account/guest")));
    const first = await data<Logged>(rate(places[0].id, "loved", 8));
    expect(first).toMatchObject({ score: 8, opponent: null, asked: 0, visit: { rating: 8, dated: false } });
    expect((await call(rate(places[1].id, "fine", 9))).status).toBe(400);

    const second = await data<Logged>(rate(places[1].id, "loved"));
    expect(second.score).toBe(8.5);
    expect(second.opponent?.id).toBe(places[0].id);

    const tuned = await data<{ visit: { rating: number }; score: number }>(
      visit.PATCH(request("PATCH", `/api/visits/${second.visit.id}`, { rating: 10 }), params({ id: second.visit.id })),
    );
    expect(tuned).toMatchObject({ visit: { rating: 10 }, score: 10 });

    const answer = await data<{ id: number; score: number; subjectScore: number; opponent: Place | null }>(
      comparisons.POST(request("POST", "/api/comparisons", { comparison: { winnerPlaceId: places[0].id, loserPlaceId: places[1].id, occasion: "casual" }, next: { subjectPlaceId: places[1].id, asked: 1 } })),
    );
    expect(answer.subjectScore).toBeLessThan(10);
    expect(answer.opponent).toBeNull();

    const again = await data<{ opponent: Place | null }>(next.GET(request("GET", `/api/comparisons/next?placeId=${places[1].id}&occasion=casual&asked=0`)));
    expect(again.opponent).toBeNull();

    const undone = await data<{ score: number }>(
      comparison.DELETE(request("DELETE", `/api/comparisons/${answer.id}?placeId=${places[1].id}`), params({ id: String(answer.id) })),
    );
    expect(undone.score).toBe(10);
    const reopened = await data<{ opponent: Place | null; score: number }>(next.GET(request("GET", `/api/comparisons/next?placeId=${places[1].id}&occasion=casual&asked=0`)));
    expect(reopened.opponent?.id).toBe(places[0].id);
    expect((await call(comparison.DELETE(request("DELETE", `/api/comparisons/${answer.id}`), params({ id: String(answer.id) })))).status).toBe(404);
    expect((await call(next.GET(request("GET", `/api/comparisons/next?placeId=x&occasion=casual&asked=0`)))).status).toBe(400);
  });

  it("signing up keeps the guest's id and places", async () => {
    await data(guest.POST(request("POST", "/api/account/guest")));
    await data(rate(places[0].id, "loved"));
    const [{ id }] = await state.db!.query<{ id: string }>("SELECT id FROM users WHERE is_guest");
    expect((await call(register.POST(request("POST", "/api/account/register", { email: "a@example.com", password: "long-enough" })))).status).toBe(409);
    expect(await data(register.POST(request("POST", "/api/account/register", { email: "new@example.com", password: "long-enough" })))).toEqual({ user: { email: "new@example.com" }, upgraded: true });
    const acct = await data<{ user: { guest: boolean; email: string }; progress: { rated: number } }>(account.GET(request("GET", "/api/account")));
    expect(acct).toMatchObject({ user: { guest: false, email: "new@example.com" }, progress: { rated: 1 } });
    expect((await state.db!.query<{ user_id: string }>("SELECT user_id FROM visits"))[0].user_id).toBe(id);
  });

  it("signing in from a guest session merges the guest into the account", async () => {
    await data(register.POST(request("POST", "/api/account/register", { email: "me@example.com", password: "long-enough" })));
    state.jar = new Map();
    await data(guest.POST(request("POST", "/api/account/guest")));
    await data(rate(places[0].id, "loved"));
    await data(rate(places[1].id, "fine"));
    const res = await data<{ merged?: { visits: number } }>(login.POST(request("POST", "/api/account/login", { email: "me@example.com", password: "long-enough" })));
    expect(res.merged).toEqual({ visits: 2 });
    expect(await state.db!.query("SELECT 1 FROM users WHERE is_guest")).toEqual([]);
    expect((await data<{ progress: { rated: number } }>(account.GET(request("GET", "/api/account")))).progress.rated).toBe(2);
  });

  it("a guest deletes itself with no password", async () => {
    await data(guest.POST(request("POST", "/api/account/guest")));
    expect(await data(account.DELETE(request("DELETE", "/api/account")))).toEqual({});
    expect(await state.db!.query("SELECT 1 FROM users WHERE is_guest")).toEqual([]);
  });
});
