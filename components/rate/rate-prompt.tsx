import { ButtonLink } from "@/components/ui";
import type { Progress } from "@/lib/types";
import { ProgressText } from "./progress";

/** Near me's one prompt while fewer than 10 places are rated. No close button; it goes away at 10. */
export function RatePrompt({ progress }: { progress: Progress }) {
  if (progress.rated >= progress.goal) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border-y border-hairline-strong py-4">
      <div className="min-w-0">
        <p className="text-[16px] font-medium text-ink">Rate places you&apos;ve been</p>
        <ProgressText progress={progress} className="mt-1 block" />
      </div>
      <ButtonLink href="/rate" variant="accent">
        Rate places
      </ButtonLink>
    </section>
  );
}
