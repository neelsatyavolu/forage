import type { Metadata } from "next";
import { ExplorePanel } from "@/components/explore/explore-panel";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <Page title="Explore" lede="Pick a city, a neighborhood or one of your Lodestar trips, then a mode.">
      <ExplorePanel />
    </Page>
  );
}
