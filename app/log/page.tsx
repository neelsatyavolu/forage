import type { Metadata } from "next";
import { RatePageFlow } from "@/components/rate/rate-page-flow";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Rate a place", robots: { index: false } };

// The + Rate sheet as a full page, for deep links (/log?place=<id>).
export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const { place } = await searchParams;
  return (
    <Page title="Rate a place">
      <RatePageFlow initialPlaceId={typeof place === "string" ? place : undefined} />
    </Page>
  );
}
