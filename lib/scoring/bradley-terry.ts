import type { Reaction } from "../types";

// Bradley-Terry scores for one user's places within one occasion.
//
// Each place has a strength s on the 0-10 score scale, and the chance that i
// beats j is sigmoid((s_i - s_j) / SCALE). The reaction band the user picked
// (loved / fine / disliked) is a Gaussian prior on s, so a place with no
// comparisons sits at its band's prior and each answered comparison moves the
// pair apart. The fit is the MAP estimate, found with a minorize-maximize
// (MM) update: the objective is concave and every step is guaranteed to
// climb it, so the fit always converges, with no step size to tune.

export const BAND_PRIOR: Record<Reaction, number> = { loved: 8.5, fine: 6, disliked: 3.5 };

/** Spread of the band prior, in score points. Smaller keeps places closer to their band. */
const PRIOR_SD = 1;
/** Score gap that makes one place about 73% likely to beat the other. */
const SCALE = 1;
const MAX_ITERATIONS = 5000;
const TOLERANCE = 1e-7;

export type FitItem = { id: string; reaction: Reaction };
export type FitComparison = { winnerPlaceId: string; loserPlaceId: string };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number) => Math.min(10, Math.max(0, x));

/**
 * Scores (0-10, two decimals) for every item. Comparisons naming a place that
 * is not an item are ignored, so a deleted visit drops out of the fit.
 */
export function fitScores(items: readonly FitItem[], comparisons: readonly FitComparison[]): Map<string, number> {
  const index = new Map(items.map((it, i) => [it.id, i]));
  const prior = items.map((it) => BAND_PRIOR[it.reaction]);
  const pairs = comparisons
    .map((c) => [index.get(c.winnerPlaceId), index.get(c.loserPlaceId)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]);

  // MM curvature bound per place: the prior's 1/sd^2 plus 1/(2 SCALE^2) per comparison it is in.
  const degree = items.map(() => 0);
  for (const [w, l] of pairs) {
    degree[w] += 1;
    degree[l] += 1;
  }
  const bound = degree.map((d) => 1 / PRIOR_SD ** 2 + d / (2 * SCALE ** 2));

  let s = [...prior];
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const grad = s.map((v, i) => -(v - prior[i]) / PRIOR_SD ** 2);
    for (const [w, l] of pairs) {
      const push = (1 - sigmoid((s[w] - s[l]) / SCALE)) / SCALE;
      grad[w] += push;
      grad[l] -= push;
    }
    const next = s.map((v, i) => v + grad[i] / bound[i]);
    const moved = Math.max(0, ...next.map((v, i) => Math.abs(v - s[i])));
    s = next;
    if (moved < TOLERANCE) break;
  }
  return new Map(items.map((it, i) => [it.id, Math.round(clamp(s[i]) * 100) / 100]));
}
