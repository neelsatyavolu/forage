import type { Metadata } from "next";
import { ListsView } from "@/components/lists/lists-view";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Lists", robots: { index: false } };

export default function ListsPage() {
  return (
    <Page title="Lists" lede="Places you've been, ranked within each occasion, and places you want to try.">
      <ListsView />
    </Page>
  );
}
