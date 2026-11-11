import type { Metadata } from "next";
import { EmptyState, Page } from "@/components/ui";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <Page title="Ask" lede="Describe tonight in a sentence and get three picks with reasons.">
      <EmptyState>Ask will show here.</EmptyState>
    </Page>
  );
}
