import type { Metadata } from "next";
import { QuickStart } from "@/components/log/quick-start";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Quick start", robots: { index: false } };

export default function QuickStartPage() {
  return (
    <Page title="Add places you love" lede="Search for places you already like and add each with one tap. Forage uses them to learn your taste.">
      <QuickStart />
    </Page>
  );
}
