/** A place on the map: one you've been (with your best score) or want to try. */
export type MapPin = { id: string; name: string; lat: number; lng: number; kind: "been" | "want"; score: number | null };

/** The text inside a pin: the score to one decimal, or nothing. */
export function pinLabel(pin: MapPin): string {
  return pin.kind === "been" && pin.score !== null ? pin.score.toFixed(1) : "";
}
