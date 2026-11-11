import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetForm } from "@/components/account/reset-form";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPage() {
  return (
    <Page title="Choose a new password">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </Page>
  );
}
