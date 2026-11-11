import type { Metadata } from "next";
import { LogFlow } from "@/components/log/log-flow";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Log a visit", robots: { index: false } };

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const { place } = await searchParams;
  return (
    <Page title="Log a visit">
      <LogFlow initialPlaceId={typeof place === "string" ? place : undefined} />
    </Page>
  );
}
