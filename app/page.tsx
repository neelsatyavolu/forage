import { redirect } from "next/navigation";
import { NearMe } from "@/components/recs/near-me";
import { Page } from "@/components/ui";
import { opensOnRate } from "@/lib/rate/entry-server";

// New visitors, and anyone with fewer than 10 rated places who hasn't closed
// the rating flow on this browser, start on /rate. Decided here on the
// server so Near me never flashes first.
export default async function NearMePage() {
  if (await opensOnRate()) redirect("/rate");
  return (
    <Page title="Near me" lede="Picks around you, based on where you've eaten.">
      <NearMe />
    </Page>
  );
}
