import type { Area } from "@/lib/explore/geocode";
import type { TripSummary } from "@/lib/lodestar/trips";

export type { Area, TripSummary };

/** Where Explore recommends around: a searched area, optionally from a Lodestar trip. */
export type Spot = Area & { trip: TripSummary | null };

export type ExploreMode = "travel" | "splurge" | "stretch";

export const MODES: { id: ExploreMode; label: string; hint: string }[] = [
  { id: "travel", label: "Travel", hint: "Travel: the best fits for you here." },
  { id: "splurge", label: "Splurge", hint: "Splurge: special-occasion places, no price limit." },
  { id: "stretch", label: "Stretch", hint: "Stretch: cuisines you haven't rated, close to ones you like." },
];

export const dateSpan = (start: string | null, end: string | null): string | null => (start ? (end && end !== start ? `${start} to ${end}` : start) : null);
