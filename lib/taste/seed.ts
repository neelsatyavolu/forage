import type { TasteSeed, TasteWeights } from "../types";

// Liked cuisines imported from Lodestar, folded into weights computed from
// visits. A cuisine the user's own visits already rate at SEED_WEIGHT or more,
// or rate negatively, keeps its visit-derived weight: only missing or weak
// positive weights are raised.

export const SEED_WEIGHT = 0.4;

export function seedWeights(weights: TasteWeights, seed: TasteSeed | null): TasteWeights {
  if (!seed || seed.cuisines.length === 0) return weights;
  const seeded = seed.cuisines
    .map((c) => `cuisine:${c}`)
    .filter((t) => {
      const w = weights[t];
      return w === undefined || (w >= 0 && w < SEED_WEIGHT);
    })
    .map((t) => [t, SEED_WEIGHT] as const);
  return { ...weights, ...Object.fromEntries(seeded) };
}
