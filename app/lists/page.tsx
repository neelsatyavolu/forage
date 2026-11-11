import type { Metadata } from "next";
import { EmptyState, Page } from "@/components/ui";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return (
    <Page title="Lists" lede="Places you've been and places you want to try, by occasion.">
      <EmptyState>Your lists will show here.</EmptyState>
    </Page>
  );
}
