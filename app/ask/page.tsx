import { redirect } from "next/navigation";

// Ask lives on Near me now, as the input at the top of the picks.
export default function AskPage() {
  redirect("/?ask=1");
}
