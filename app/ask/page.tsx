import type { Metadata } from "next";
import { AskPanel } from "@/components/recs/ask-panel";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <Page title="Ask" lede="Describe tonight in a sentence and get three picks with reasons.">
      <AskPanel />
    </Page>
  );
}
