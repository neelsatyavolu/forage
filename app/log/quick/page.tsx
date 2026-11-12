import { redirect } from "next/navigation";

// Quick start is retired; the rating flow does its job.
export default function QuickStartPage() {
  redirect("/rate");
}
