import { Compass, List, MapPin, User, type LucideIcon } from "lucide-react";
import type { AccountState } from "@/components/account/use-account";

// Three destinations plus You, the same on desktop and phone. Rating is the
// one global action (+ Rate), not a tab.

export const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Near me", icon: MapPin },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/lists", label: "Lists", icon: List },
];
export const YOU = { href: "/account", label: "You", icon: User };

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/** Pages with their own chrome (the full-screen rating flow) hide the nav. */
export const hidesNav = (pathname: string) => pathname === "/rate";

/** The desktop You link says what it does: sign in, save a guest's places, or open You. */
export function youLabel(state: AccountState): string {
  if (state.status === "signed-out") return "Sign in";
  if (state.status === "signed-in" && state.user.guest) return "Save places";
  return "You";
}
