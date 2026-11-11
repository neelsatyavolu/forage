import type { Metadata } from "next";
import { EmptyState, Page } from "@/components/ui";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <Page title="Explore" lede="Pick a city or neighborhood and a mode: travel, splurge or stretch.">
      <EmptyState>Explore will show here.</EmptyState>
    </Page>
  );
}
