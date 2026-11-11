import { z } from "zod";
import type { Queryable } from "../db/client";
import { OccasionSchema, type Place } from "../types";
import type { AskAi } from "./ai";

// AI-written tag cards. Places are shared by every user, so a card is written
// only from public facts (name, cuisine, address, OSM tags), never from one
// user's notes; the user's own dishes and notes join their profile through
// placeTags extras instead. Cards are cached in places.tags with
// cardSource "ai" so they are written once per place.

const MAX_PER_CALL = 12;
const words = (max: number) => z.array(z.string().trim().min(1).max(40)).max(max).catch([]);

const CardSchema = z.object({
  id: z.string().max(10),
  dishes: words(6),
  vibe: words(4),
  attributes: words(6),
  // Keep the valid occasions even when the model adds one we don't use.
  occasions: z
    .array(z.unknown())
    .max(8)
    .catch([])
    .transform((xs) => xs.flatMap((x) => (OccasionSchema.safeParse(x).success ? [x as z.infer<typeof OccasionSchema>] : []))),
  description: z.string().trim().max(240).catch(""),
});
export type Card = z.infer<typeof CardSchema>;
const CardsSchema = z.object({ cards: z.array(CardSchema).max(MAX_PER_CALL) });

const SYSTEM = `You write short feature cards for restaurants, cafes and bars.
Describe only what the given facts support: the name, cuisine, address and map tags. Use what is commonly true of that kind of place and cuisine, and nothing specific you can't know.
Never invent ratings, prices, opening hours, awards, chefs or reviews. Leave a field empty when unsure.
dishes: up to 6 dishes this kind of place typically serves. vibe: up to 4 words (e.g. casual, lively, quiet, upscale, cozy). attributes: up to 6 (e.g. counter, takeaway, cocktails, vegetarian_friendly).
occasions: any of quick, casual, night_out, special. description: one plain sentence, under 200 characters.
Answer with JSON only: {"cards":[{"id","dishes","vibe","attributes","occasions","description"}]}, one card per place, using the ids given.`;

const publicFacts = (p: Place, id: string): string => {
  const t = p.tags as Record<string, unknown>;
  const osm = Array.isArray(t.attributes) ? t.attributes.filter((a): a is string => typeof a === "string").slice(0, 8) : [];
  return [
    `id: ${id}`,
    `name: ${p.name}`,
    p.cuisine.length ? `cuisine: ${p.cuisine.join(", ")}` : null,
    p.priceLevel ? `price level: ${p.priceLevel} of 4` : null,
    [p.address, p.city, p.country].filter(Boolean).join(", ") || null,
    osm.length ? `map tags: ${osm.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

export const hasAiCard = (p: Place): boolean => (p.tags as Record<string, unknown>).cardSource === "ai";

export function cardPrompt(places: readonly Place[]): string {
  return places.map((p, i) => publicFacts(p, `p${i + 1}`)).join("\n\n");
}

const union = (a: unknown, b: readonly string[]): string[] => [...new Set([...(Array.isArray(a) ? a : []), ...b])].slice(0, 12);

/** The tags to merge into a place: AI values join (never replace) what a source already set. */
export function cardTags(place: Place, card: Card, now: number): Record<string, unknown> {
  const t = place.tags as Record<string, unknown>;
  return {
    dishes: union(t.dishes, card.dishes),
    vibe: union(t.vibe, card.vibe),
    attributes: union(t.attributes, card.attributes),
    occasions: union(t.occasions, card.occasions),
    ...(typeof t.description === "string" && t.description ? {} : card.description ? { aiDescription: card.description } : {}),
    cardSource: "ai",
    cardAt: now,
  };
}

/** Asks the AI for cards for places that don't have one. Returns placeId -> card; unknown ids are dropped. */
export async function writeCards(ask: AskAi, places: readonly Place[]): Promise<Map<string, Card>> {
  const todo = places.filter((p) => !hasAiCard(p)).slice(0, MAX_PER_CALL);
  if (todo.length === 0) return new Map();
  const { cards } = await ask({ system: SYSTEM, prompt: cardPrompt(todo), schema: CardsSchema });
  const byId = new Map(todo.map((p, i) => [`p${i + 1}`, p.id]));
  return new Map(cards.filter((c) => byId.has(c.id)).map((c) => [byId.get(c.id) as string, c]));
}

/** Merges a card into the stored place. JSONB || keeps every key the card doesn't set. */
export async function storeCard(q: Queryable, place: Place, card: Card, now: number): Promise<void> {
  await q.query("UPDATE places SET tags = tags || $2::jsonb WHERE id = $1", [place.id, JSON.stringify(cardTags(place, card, now))]);
}
