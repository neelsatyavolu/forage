import type { Area } from "@/lib/explore/geocode";
import type { TripSummary } from "@/lib/lodestar/trips";

export type { Area, TripSummary };

/** Where Explore recommends around: a searched area, optionally from a Lodestar trip. */
export type Spot = Area & { trip: TripSummary | null };

export type ExploreMode = "travel" | "splurge" | "stretch";

export const MODES: { id: ExploreMode; label: string; hint: string }[] = [
  { id: "travel", label: "Travel", hint: "The best fits for you here." },
  { id: "splurge", label: "Splurge", hint: "Special places, no budget ceiling." },
  { id: "stretch", label: "Stretch", hint: "Something new, close to what you like." },
];

export const dateSpan = (start: string | null, end: string | null): string | null => (start ? (end && end !== start ? `${start} to ${end}` : start) : null);
