import { EmptyState, Page } from "@/components/ui";

export default function NearMePage() {
  return (
    <Page title="Near me" lede="Picks around you, based on where you've eaten.">
      <EmptyState>Recommendations near you will show here.</EmptyState>
    </Page>
  );
}
