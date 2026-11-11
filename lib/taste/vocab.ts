import type { Place } from "../types";

// The tag vocabulary every taste weight and place card is written in.
// A tag is "<kind>:<value>", e.g. "cuisine:ramen", "dish:dan_dan_noodles",
// "price:2", "occasion:night_out", "vibe:cozy", "attr:outdoor_seating".

export const TAG_KINDS = ["cuisine", "dish", "price", "occasion", "vibe", "attr", "amenity"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** How much a matching tag of each kind counts toward taste similarity. */
export const KIND_WEIGHT: Record<TagKind, number> = {
  cuisine: 1,
  dish: 0.8,
  vibe: 0.6,
  attr: 0.5,
  price: 0.4,
  occasion: 0.4,
  amenity: 0.3,
};

/** "Hand-pulled Noodles!" -> "hand_pulled_noodles". Empty when nothing is left. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const tag = (kind: TagKind, value: string | number): string | null => {
  const s = slug(String(value));
  return s ? `${kind}:${s}` : null;
};

export const kindOf = (t: string): TagKind | null => {
  const kind = t.slice(0, t.indexOf(":")) as TagKind;
  return TAG_KINDS.includes(kind) ? kind : null;
};

export const valueOf = (t: string): string => t.slice(t.indexOf(":") + 1);

/** OSM packs several cuisines into one value: "ramen;japanese". */
export function splitCuisine(values: readonly string[]): string[] {
  return values.flatMap((v) => v.split(/[;,]/)).map(slug).filter(Boolean);
}

// Words in a user's notes that map onto the vocabulary. Matching is on whole
// words, so "spicy" hits "very spicy broth" but "loud" doesn't hit "cloud".
const NOTE_WORDS: Record<string, string> = {
  cozy: "vibe:cozy",
  cosy: "vibe:cozy",
  quiet: "vibe:quiet",
  loud: "vibe:loud",
  noisy: "vibe:loud",
  lively: "vibe:lively",
  romantic: "vibe:romantic",
  casual: "vibe:casual",
  fancy: "vibe:upscale",
  upscale: "vibe:upscale",
  trendy: "vibe:scene",
  scene: "vibe:scene",
  "hole in the wall": "vibe:hole_in_the_wall",
  divey: "vibe:divey",
  spicy: "attr:spicy",
  cheap: "attr:cheap",
  "good value": "attr:cheap",
  expensive: "attr:pricey",
  pricey: "attr:pricey",
  patio: "attr:outdoor_seating",
  outdoor: "attr:outdoor_seating",
  view: "attr:view",
  "natural wine": "attr:natural_wine",
  wine: "attr:wine",
  cocktails: "attr:cocktails",
  beer: "attr:beer",
  vegan: "attr:vegan",
  vegetarian: "attr:vegetarian",
  "gluten free": "attr:gluten_free",
  brunch: "attr:brunch",
  "late night": "attr:late_night",
  "tasting menu": "attr:tasting_menu",
  "counter seating": "attr:counter",
  "long wait": "attr:long_wait",
  "slow service": "attr:slow_service",
  "small plates": "attr:small_plates",
  portions: "attr:big_portions",
};

/** Vocabulary tags mentioned in free text. */
export function noteTags(text: string): string[] {
  const words = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return Object.entries(NOTE_WORDS)
    .filter(([word]) => words.includes(` ${word} `))
    .map(([, t]) => t);
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// OSM yes/no keys worth turning into attributes, when the places track keeps them.
const OSM_FLAGS: Record<string, string> = {
  outdoor_seating: "attr:outdoor_seating",
  takeaway: "attr:takeaway",
  delivery: "attr:delivery",
  "diet:vegan": "attr:vegan",
  "diet:vegetarian": "attr:vegetarian",
  "diet:gluten_free": "attr:gluten_free",
};

/** What one user adds to a place's card: dishes they ordered and their notes. */
export type UserExtras = { dishes?: readonly string[]; notes?: readonly string[] };

/** Every vocabulary tag for a place, sorted and without repeats. */
export function placeTags(place: Pick<Place, "cuisine" | "priceLevel" | "tags">, extras: UserExtras = {}): string[] {
  const t = place.tags as Record<string, unknown>;
  const out: (string | null)[] = [
    ...splitCuisine(place.cuisine).map((c) => `cuisine:${c}`),
    place.priceLevel ? `price:${place.priceLevel}` : null,
    typeof t.amenity === "string" ? tag("amenity", t.amenity) : null,
    ...asStrings(t.occasions).map((o) => tag("occasion", o)),
    ...[...asStrings(t.dishes), ...(extras.dishes ?? [])].map((d) => tag("dish", d)),
    ...asStrings(t.vibe).map((v) => tag("vibe", v)),
    ...asStrings(t.attributes).map((a) => tag("attr", a)),
    ...Object.entries(OSM_FLAGS).map(([key, value]) => (t[key] === "yes" ? value : null)),
    ...(extras.notes ?? []).flatMap(noteTags),
  ];
  return [...new Set(out.filter((x): x is string => x !== null))].sort();
}
