import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/account-panel";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default function AccountPage() {
  return (
    <Page title="Account">
      <AccountPanel />
    </Page>
  );
}
