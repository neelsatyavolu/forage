"use client";

import { Button, ScoreText } from "@/components/ui";
import { FIRST_PICKS_AT, type Progress } from "@/lib/types";
import type { Candidate, Rated } from "./flow";

/** The places just rated, best first, and where to go next. */
export function Finish({ list, progress, place, onPicks, onMore }: { list: { candidate: Candidate; rated: Rated }[]; progress: Progress | null; place: string; onPicks: () => void; onMore: () => void }) {
  const total = progress?.rated ?? list.length;
  const ready = total >= FIRST_PICKS_AT;
  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.01em] max-[720px]:text-[30px]">
          {total === 0 ? "Nothing rated yet." : `That's ${total} rated.`}
        </h1>
        <p className="mt-3 font-serif text-[18px] leading-[1.6] text-body">
          {ready ? (place === "you" ? "Your picks are ready." : `Your picks near ${place} are ready.`) : `Rate ${FIRST_PICKS_AT - total} more to unlock picks.`}
        </p>
      </div>
      {list.length > 0 && (
        <ol className="max-w-[640px] border-t border-hairline-strong">
          {list.map(({ candidate, rated }, i) => (
            <li key={candidate.place.id} className="grid grid-cols-[32px_1fr_auto] items-baseline gap-4 border-b border-hairline px-2 py-3">
              <span className="font-mono text-[12px] text-mute tabular-nums">{i + 1}</span>
              <span className="min-w-0 truncate text-[15px] font-medium">{candidate.place.name}</span>
              {rated.score !== null ? <ScoreText value={rated.score} /> : <span className="font-mono text-mute">–</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <>
            <Button variant="accent" onClick={onPicks}>
              See picks near you
            </Button>
            <Button onClick={onMore}>Rate more places</Button>
          </>
        ) : (
          <>
            <Button variant="accent" onClick={onMore}>
              Rate more places
            </Button>
            <Button variant="quiet" onClick={onPicks}>
              Go to Near me
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
