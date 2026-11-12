import { RATE_GOAL } from "../types";

// When opening Forage lands on the rating flow instead of Near me: fewer than
// RATE_GOAL places rated and the flow not closed on this browser. Closing it
// sets a plain cookie the server page can read, so the redirect has no flash.

export const RATE_DISMISSED_COOKIE = "fg_rate_dismissed";
const DISMISS_DAYS = 30;

export const shouldOpenRate = (rated: number, dismissed: boolean): boolean => !dismissed && rated < RATE_GOAL;

/** The document.cookie string that remembers the flow was closed (30 days, whole site). */
export const dismissCookie = (): string => `${RATE_DISMISSED_COOKIE}=1; Max-Age=${DISMISS_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax`;

/** Under 5: "2 of 5" toward first picks. 5 to 9: "6 of 10" toward better ones. 10 and up: nothing to show. */
export function progressLine(rated: number, firstPicksAt = 5, goal = RATE_GOAL): { count: string; note: string } | null {
  if (rated >= goal) return null;
  if (rated < firstPicksAt) {
    const left = firstPicksAt - rated;
    return { count: `${rated} of ${firstPicksAt}`, note: `Rate ${left} more to get picks` };
  }
  return { count: `${rated} of ${goal}`, note: "Picks get better as you rate" };
}
