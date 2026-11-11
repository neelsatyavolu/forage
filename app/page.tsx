import { NearMe } from "@/components/recs/near-me";
import { Page } from "@/components/ui";

export default function NearMePage() {
  return (
    <Page title="Near me" lede="Picks around you, based on where you've eaten.">
      <NearMe />
    </Page>
  );
}
