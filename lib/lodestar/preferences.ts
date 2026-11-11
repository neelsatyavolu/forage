import { z } from "zod";
import { slug } from "../taste/vocab";
import type { TasteSeed } from "../types";

// Lodestar's dining preferences (its get_preferences tool) and what Forage
// keeps of them: liked cuisines as vocabulary slugs, dietary needs as OSM
// diet keys, and the dining budget as a price ceiling (1-4).

export const BUDGETS = ["$", "$$", "$$$", "$$$$"] as const;

export const GetPreferencesSchema = z.object({
  cuisines: z.array(z.string().max(100)).max(100),
  dietary: z.array(z.string().max(100)).max(50),
  diningBudget: z.enum(BUDGETS).nullable(),
  homeAirports: z.array(z.string()).max(50).optional(),
});
export type LodestarPreferences = z.infer<typeof GetPreferencesSchema>;

/** Lodestar's words for dietary needs, as OSM `diet:*` keys. Anything else is dropped (it can't be checked against places). */
const DIET: Record<string, string> = {
  vegetarian: "vegetarian",
  veggie: "vegetarian",
  vegan: "vegan",
  plant_based: "vegan",
  gluten_free: "gluten_free",
  celiac: "gluten_free",
  coeliac: "gluten_free",
  no_gluten: "gluten_free",
  halal: "halal",
  kosher: "kosher",
  dairy_free: "lactose_free",
  lactose_free: "lactose_free",
  no_dairy: "lactose_free",
  pescatarian: "pescetarian",
  pescetarian: "pescetarian",
};

const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function toSeed(prefs: LodestarPreferences): TasteSeed {
  return {
    cuisines: unique(prefs.cuisines.map(slug)).slice(0, 30),
    dietary: unique(prefs.dietary.map((d) => DIET[slug(d)])),
    priceCeiling: prefs.diningBudget ? BUDGETS.indexOf(prefs.diningBudget) + 1 : null,
  };
}
