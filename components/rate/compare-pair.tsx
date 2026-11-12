"use client";

import { Button } from "@/components/ui";
import { placeKind } from "@/lib/rate/occasion";
import { shortAddress } from "@/lib/places/format";
import { OCCASION_LABEL, type Occasion, type Place } from "@/lib/types";

function Side({ place, keyHint, disabled, onPick }: { place: Place; keyHint: string; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="flex min-h-28 cursor-pointer flex-col justify-between gap-3 rounded-sm border border-field bg-card p-4 text-left hover:bg-hover disabled:cursor-default"
    >
      <span className="min-w-0">
        <span className="block text-[17px] font-medium text-ink">{place.name}</span>
        <span className="mt-1 block truncate text-[13px] text-mute">{[placeKind(place), shortAddress(place)].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="font-mono text-[12px] text-mute max-[720px]:hidden" aria-hidden>
        {keyHint}
      </span>
    </button>
  );
}

/** "Which did you like more?" between the place just rated and one from the same occasion and band. */
export function ComparePair({ subject, opponent, occasion, busy, notice, onPick, onTooTough }: { subject: Place; opponent: Place; occasion: Occasion; busy: boolean; notice: string | null; onPick: (winner: Place) => void; onTooTough: () => void }) {
  const done = notice !== null;
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 border-t border-hairline-strong pt-3 font-mono text-[12px]">
        <h2 className="text-ink">Which did you like more?</h2>
        <span className="text-mute">{OCCASION_LABEL[occasion]}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
        <Side place={subject} keyHint="←" disabled={busy || done} onPick={() => onPick(subject)} />
        <Side place={opponent} keyHint="→" disabled={busy || done} onPick={() => onPick(opponent)} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Button variant="quiet" onClick={onTooTough} disabled={busy || done}>
          Too tough
        </Button>
        <p className="text-[15px] text-ink" aria-live="polite">
          {notice}
        </p>
      </div>
    </section>
  );
}
