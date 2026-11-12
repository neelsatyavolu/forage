import type { Metadata } from "next";
import { RateFlow } from "@/components/rate/rate-flow";

export const metadata: Metadata = { title: "Rate places", robots: { index: false } };

// Full screen: the app's nav hides here (components/nav.tsx); the flow has its own Close and Undo.
export default function RatePage() {
  return <RateFlow />;
}
