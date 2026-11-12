"use client";

import { useRouter } from "next/navigation";
import { QuickRate } from "./quick-rate";

/** /log: one place at a time; Done goes to Lists. */
export function RatePageFlow({ initialPlaceId }: { initialPlaceId?: string }) {
  const router = useRouter();
  return (
    <div className="max-w-[720px]">
      <QuickRate initialPlaceId={initialPlaceId} onDone={() => router.push("/lists")} />
    </div>
  );
}
