import { z } from "zod";

// Shared contracts for every feature track. Zod schemas validate API input and
// AI output; the inferred types are what lib/db and the UI pass around.
// Times are epoch milliseconds; calendar days are "YYYY-MM-DD" strings.

export const ReactionSchema = z.enum(["loved", "fine", "disliked"]);
export type Reaction = z.infer<typeof ReactionSchema>;

export const OccasionSchema = z.enum(["quick", "casual", "night_out", "special"]);
export type Occasion = z.infer<typeof OccasionSchema>;
export const OCCASIONS = OccasionSchema.options;
export const OCCASION_LABEL: Record<Occasion, string> = { quick: "Quick bite", casual: "Casual", night_out: "Night out", special: "Special" };

export const PlaceSourceSchema = z.enum(["osm", "manual"]);
export type PlaceSource = z.infer<typeof PlaceSourceSchema>;

export const IdSchema = z.uuid();
export const DaySchema = z.iso.date();

export const LatLngSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof LatLngSchema>;

/** A place's feature card. Known keys are typed; anything else a source adds is kept. */
export const PlaceTagsSchema = z.looseObject({
  dishes: z.array(z.string()).optional(),
  vibe: z.array(z.string()).optional(),
  attributes: z.array(z.string()).optional(),
  occasions: z.array(OccasionSchema).optional(),
  /** OSM diet keys the place marks as not served (`diet:vegan=no`). */
  dietNo: z.array(z.string()).optional(),
  openingHours: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
});
export type PlaceTags = z.infer<typeof PlaceTagsSchema>;

export const PriceLevelSchema = z.number().int().min(1).max(4);

/** What it takes to create or refresh a place (no id or timestamp). */
export const PlaceInputSchema = z.object({
  source: PlaceSourceSchema,
  sourceId: z.string().min(1).max(200),
  googlePlaceId: z.string().max(300).nullable(),
  name: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(500).nullable(),
  city: z.string().max(200).nullable(),
  country: z.string().max(100).nullable(),
  cuisine: z.array(z.string().max(60)).max(20),
  priceLevel: PriceLevelSchema.nullable(),
  tags: PlaceTagsSchema,
});
export type PlaceInput = z.infer<typeof PlaceInputSchema>;

export const PlaceSchema = PlaceInputSchema.extend({ id: IdSchema, updatedAt: z.number() });
export type Place = z.infer<typeof PlaceSchema>;

/** A visit as the user logs it. */
export const VisitInputSchema = z.object({
  placeId: IdSchema,
  visitedOn: DaySchema,
  reaction: ReactionSchema,
  occasion: OccasionSchema,
  dishes: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  note: z.string().trim().max(2000).nullable().default(null),
});
export type VisitInput = z.infer<typeof VisitInputSchema>;
export const VisitPatchSchema = VisitInputSchema.omit({ placeId: true }).partial();
export type VisitPatch = z.infer<typeof VisitPatchSchema>;

export const VisitSchema = VisitInputSchema.extend({ id: IdSchema, userId: IdSchema, createdAt: z.number() });
export type Visit = z.infer<typeof VisitSchema>;

export const ComparisonInputSchema = z
  .object({ winnerPlaceId: IdSchema, loserPlaceId: IdSchema, occasion: OccasionSchema })
  .refine((c) => c.winnerPlaceId !== c.loserPlaceId, "A place can't be compared with itself.");
export type ComparisonInput = z.infer<typeof ComparisonInputSchema>;
export type Comparison = ComparisonInput & { id: number; userId: string; createdAt: number };

export const ScoreSchema = z.number().min(0).max(10);
export const PlaceScoreSchema = z.object({ userId: IdSchema, placeId: IdSchema, occasion: OccasionSchema, score: ScoreSchema, updatedAt: z.number() });
export type PlaceScore = z.infer<typeof PlaceScoreSchema>;

export const WantSourceSchema = z.enum(["manual", "rec", "ask", "import", "lodestar"]);
export type WantSource = z.infer<typeof WantSourceSchema>;
export type WantItem = { userId: string; placeId: string; addedAt: number; source: WantSource };

/** Weights over feature-card tags, keyed "cuisine:ramen", "dish:dumplings", "vibe:loud", "price:2", ... in [-1, 1]. */
export const TasteWeightsSchema = z.record(z.string().max(100), z.number().min(-1).max(1));
export type TasteWeights = z.infer<typeof TasteWeightsSchema>;

export const TasteProfileSchema = z.object({
  userId: IdSchema,
  weights: TasteWeightsSchema,
  summary: z.string().max(2000),
  summaryEdited: z.boolean(),
  updatedAt: z.number(),
});
export type TasteProfile = z.infer<typeof TasteProfileSchema>;

/** Dining preferences imported from Lodestar: liked cuisine slugs, OSM diet keys, and a price ceiling (1-4) for Near me. */
export type TasteSeed = { cuisines: string[]; dietary: string[]; priceCeiling: number | null };

/** predicted is what the user was shown; rawPredicted is the same before the calibration offset. */
export type Prediction = { id: number; userId: string; placeId: string; predicted: number; rawPredicted: number; actual: number | null; createdAt: number };

export type LodestarLink = { userId: string; sealedTokens: string; lodestarUserLabel: string | null; createdAt: number };

// ---------- Recommendations ----------

export const RecModeSchema = z.enum(["near", "travel", "splurge", "stretch"]);
export type RecMode = z.infer<typeof RecModeSchema>;

export const RecContextSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(50),
  mode: RecModeSchema,
  /** What the user said they want, in their words ("spicy, under $30"). */
  want: z.string().trim().max(500).optional(),
  partySize: z.number().int().min(1).max(20).optional(),
  openNow: z.boolean().optional(),
  occasion: OccasionSchema.optional(),
});
export type RecContext = z.infer<typeof RecContextSchema>;

/** Why a place scored what it did. Each part is in [0, 1] unless noted. */
export const RecSignalsSchema = z.object({
  taste: z.number().min(0).max(1),
  /** Crowd quality prior, null when no source has a rating. */
  quality: z.number().min(0).max(1).nullable(),
  distanceKm: z.number().min(0),
  novelty: z.number().min(0).max(1),
  /** The user has a logged visit here. */
  visited: z.boolean(),
  /** On the user's want list. */
  wanted: z.boolean(),
});
export type RecSignals = z.infer<typeof RecSignalsSchema>;

export const RecSchema = z.object({
  place: PlaceSchema,
  /** Predicted score for this user, 0-10. */
  score: ScoreSchema,
  /** One line from the AI rerank citing the user's own places. Absent without AI. */
  reason: z.string().max(400).optional(),
  signals: RecSignalsSchema,
});
export type Rec = z.infer<typeof RecSchema>;
