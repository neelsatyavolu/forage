import { progressLine } from "@/lib/rate/entry";
import type { Progress } from "@/lib/types";

/** "3 of 5 · Rate 2 more to get picks" in mono; nothing at 10 or more. `short` keeps only the count. */
export function ProgressText({ progress, short = false, className = "" }: { progress: Progress | null; short?: boolean; className?: string }) {
  const line = progress ? progressLine(progress.rated, progress.firstPicksAt, progress.goal) : null;
  if (!line) return null;
  return (
    <span className={`font-mono text-[12px] text-mute tabular-nums ${className}`}>
      <span className="text-ink">{line.count}</span>
      {!short && <> · {line.note}</>}
    </span>
  );
}
