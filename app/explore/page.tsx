import type { Metadata } from "next";
import { ExplorePanel } from "@/components/explore/explore-panel";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <Page title="Explore" lede="Picks for anywhere you're going.">
      <ExplorePanel />
    </Page>
  );
}
