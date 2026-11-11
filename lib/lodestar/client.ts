import { LodestarError } from "./errors";
import { callTool, type ToolOutput } from "./mcp";
import type { TokenSource } from "./store";
import { isExpired } from "./tokens";
import { GetPreferencesSchema, type LodestarPreferences } from "./preferences";
import { AddItemsSchema, GetTripSchema, ListTripsSchema, type TripDetail, type TripSummary } from "./trips";
import type { z } from "zod";

// Lodestar's Trips and preferences tools, as the linked account. An expired access token is
// refreshed before the call; a 401 refreshes once and retries once.

export type LodestarClient = {
  listTrips(): Promise<TripSummary[]>;
  getTrip(tripId: string): Promise<TripDetail>;
  addItems(tripId: string, items: Record<string, unknown>[]): Promise<string[]>;
  getPreferences(): Promise<LodestarPreferences>;
};

export type ClientDeps = { fetch: typeof fetch; mcpUrl: string; tokens: TokenSource; now: () => number };

export function lodestarClient(deps: ClientDeps): LodestarClient {
  async function call(name: string, args: Record<string, unknown>): Promise<ToolOutput> {
    let tokens = await deps.tokens.current();
    if (isExpired(tokens, deps.now())) tokens = await deps.tokens.refresh(tokens);
    try {
      return await callTool(deps.fetch, deps.mcpUrl, tokens.accessToken, name, args);
    } catch (err) {
      if (!(err instanceof LodestarError && err.code === "unauthorized")) throw err;
      tokens = await deps.tokens.refresh(tokens);
      return callTool(deps.fetch, deps.mcpUrl, tokens.accessToken, name, args);
    }
  }

  async function typed<S extends z.ZodType>(schema: S, name: string, args: Record<string, unknown>): Promise<z.output<S>> {
    const out = await call(name, args);
    const parsed = schema.safeParse(out.data);
    if (!parsed.success) throw new LodestarError("upstream", "Lodestar sent an unexpected answer.");
    return parsed.data;
  }

  return {
    listTrips: async () => (await typed(ListTripsSchema, "list_trips", {})).trips,
    getTrip: async (tripId) => (await typed(GetTripSchema, "get_trip", { tripId })).trip,
    addItems: async (tripId, items) => (await typed(AddItemsSchema, "add_items", { tripId, items })).itemIds,
    getPreferences: () => typed(GetPreferencesSchema, "get_preferences", {}),
  };
}
