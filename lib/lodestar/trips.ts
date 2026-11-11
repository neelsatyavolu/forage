import { z } from "zod";
import { DaySchema, type Place } from "../types";

// The parts of Lodestar's trip data Forage reads, validated, and the dining
// item Forage writes. Lodestar's own schemas are stricter and richer; only
// what Explore needs is checked here, and unknown fields are dropped.

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TripSummarySchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  destination: z.string().max(200).nullable(),
  startDate: Day.nullable(),
  endDate: Day.nullable(),
});
export type TripSummary = z.infer<typeof TripSummarySchema>;

export const ListTripsSchema = z.object({ trips: z.array(TripSummarySchema) });

export const TripItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  title: z.string(),
  startDate: Day,
  startTime: z.string().nullable().optional(),
});
export type TripItem = z.infer<typeof TripItemSchema>;

export const TripDetailSchema = TripSummarySchema.extend({ items: z.array(TripItemSchema) });
export type TripDetail = z.infer<typeof TripDetailSchema>;

export const GetTripSchema = z.object({ trip: TripDetailSchema });

export const AddItemsSchema = z.object({ itemIds: z.array(z.string()) });

const MAX_DAYS = 60;

/** Every day from start to end, inclusive; a one-day list when only one is set; empty without dates. */
export function tripDays(start: string | null, end: string | null): string[] {
  const first = start ?? end;
  if (!first) return [];
  const last = end && end >= first ? end : first;
  const days: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); days.length < MAX_DAYS; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > last) break;
    days.push(iso);
  }
  return days;
}

/** The meals already planned on each day of a trip, for picking a free slot. */
export function diningByDay(trip: TripDetail): Record<string, TripItem[]> {
  return trip.items
    .filter((i) => i.kind === "dining" && i.status !== "cancelled" && i.status !== "suggested")
    .reduce<Record<string, TripItem[]>>((acc, i) => ({ ...acc, [i.startDate]: [...(acc[i.startDate] ?? []), i] }), {});
}

export const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a HH:MM time.");

/** What the user sends to add a restaurant to a trip day. The restaurant itself comes from Forage's database. */
export const AddToTripSchema = z.object({
  tripId: z.uuid(),
  placeId: z.uuid(),
  day: DaySchema,
  time: ClockSchema.nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});
export type AddToTrip = z.infer<typeof AddToTripSchema>;

const PRICE = ["$", "$$", "$$$", "$$$$"];
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function webUrl(s: string | undefined): string | undefined {
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && s.length <= 2000 ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** A planned dining item for Lodestar's add_items, from a Forage place. Only keys Lodestar's strict schema knows. */
export function diningItem(place: Place, input: Pick<AddToTrip, "day" | "time" | "note">, now: number) {
  const details = {
    address: place.address ? cut(place.address, 240) : undefined,
    lat: place.lat,
    lng: place.lng,
    locatedAt: now,
    cuisine: place.cuisine[0] ? cut(place.cuisine[0], 60) : undefined,
    priceLevel: place.priceLevel ? PRICE[place.priceLevel - 1] : undefined,
    phone: place.tags.phone ? cut(place.tags.phone, 40) : undefined,
    url: webUrl(place.tags.website),
    placeId: place.googlePlaceId ? cut(`g:${place.googlePlaceId}`, 300) : undefined,
    note: input.note ?? undefined,
    provider: "Forage",
  };
  return {
    kind: "dining" as const,
    status: "planned" as const,
    title: cut(place.name, 160),
    startDate: input.day,
    startTime: input.time,
    place: place.city ? cut(place.city, 160) : null,
    details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)),
  };
}
