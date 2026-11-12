"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { OCCASION_OPTIONS, parseDishes, today } from "@/components/log/options";
import { Segmented } from "@/components/segmented";
import { Button, Field, inputClass, ScoreText, Spinner } from "@/components/ui";
import { distanceLabel, shortAddress } from "@/lib/places/format";
import { OCCASION_LABEL, type Occasion, type Place, type Reaction, type VisitPatch } from "@/lib/types";
import { bandValues } from "./flow";

export const REACTIONS: { value: Reaction; label: string; key: string }[] = [
  { value: "loved", label: "Loved it", key: "L" },
  { value: "fine", label: "It was fine", key: "F" },
  { value: "disliked", label: "Didn't like it", key: "D" },
];

export type CardState = { reaction: Reaction; rating: number | null; score: number | null } | null;

type Props = {
  place: Place;
  kind: string;
  distanceKm: number | null;
  occasion: Occasion;
  state: CardState;
  busy: boolean;
  occasionOpen: boolean;
  onOccasionOpen: (open: boolean) => void;
  onReact: (r: Reaction, rating: number | null) => void;
  onOccasion: (o: Occasion) => void;
  onDetails: (fields: VisitPatch) => void;
};

/**
 * "How was it?": three big reaction buttons (one tap saves), the guessed
 * occasion with a one-tap change, and once saved an optional fine-tune within
 * the band and folded details (date, dishes, note).
 */
export function RateCard({ place, kind, distanceKm, occasion, state, busy, occasionOpen, onOccasionOpen, onReact, onOccasion, onDetails }: Props) {
  const facts = [kind, distanceKm !== null ? distanceLabel(distanceKm) : null, shortAddress(place)].filter(Boolean).join(" · ");
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-[32px] leading-[1.15] max-[560px]:text-[28px]">{place.name}</h2>
          <p className="mt-2 text-[14px] text-mute">{facts}</p>
        </div>
        {state?.score != null && (
          <p className="shrink-0 text-right">
            <span className="block font-mono text-[12px] text-mute">Score</span>
            <ScoreText value={state.score} size="lg" />
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-3 font-mono text-[12px] text-mute">How was it?</legend>
        <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-1">
          {REACTIONS.map((r) => {
            const on = state?.reaction === r.value;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => onReact(r.value, null)}
                className={`flex h-14 cursor-pointer items-center justify-center rounded-sm border text-[16px] font-medium disabled:cursor-default ${on ? "border-accent bg-wash text-ink" : "border-field text-ink hover:bg-hover"}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-3">
        <button type="button" onClick={() => onOccasionOpen(!occasionOpen)} aria-expanded={occasionOpen} className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[14px] pointer-coarse:min-h-11">
          <span className="font-mono text-[12px] text-mute">Occasion</span>
          <span className="font-medium text-ink">{OCCASION_LABEL[occasion]}</span>
          <ChevronDown size={14} aria-hidden className="text-mute" />
        </button>
        {occasionOpen && (
          <Segmented
            label="Occasion"
            options={OCCASION_OPTIONS}
            value={occasion}
            onChange={(o) => {
              onOccasion(o);
              onOccasionOpen(false);
            }}
          />
        )}
      </div>

      {state && (
        <div className="space-y-3">
          <p className="font-mono text-[12px] text-mute">Fine-tune (optional)</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Score out of 10">
            {bandValues(state.reaction).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={state.rating === n}
                disabled={busy}
                onClick={() => onReact(state.reaction, state.rating === n ? null : n)}
                className={`size-11 cursor-pointer rounded-sm border font-mono text-[16px] tabular-nums disabled:cursor-default ${state.rating === n ? "border-accent bg-wash text-ink" : "border-field text-ink hover:bg-hover"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyed by place so an open form and typed text never carry over to the next place. */}
      {state && <Details key={place.id} busy={busy} onSave={onDetails} />}
    </div>
  );
}

function Details({ busy, onSave }: { busy: boolean; onSave: (f: VisitPatch) => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [dishes, setDishes] = useState("");
  const [note, setNote] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 cursor-pointer items-center gap-1 text-[14px] text-mute hover:text-ink pointer-coarse:min-h-11">
        Add details <ChevronRight size={14} aria-hidden />
      </button>
    );
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const fields: VisitPatch = { dishes: parseDishes(dishes), note: note.trim() || null };
    onSave(day ? { ...fields, visitedOn: day, dated: true } : fields);
  };
  return (
    <form onSubmit={save} className="max-w-[560px] space-y-6 border-t border-hairline-strong pt-3">
      <p className="font-mono text-[12px] text-ink">Details</p>
      <div className="grid grid-cols-[180px_1fr] gap-6 max-[560px]:grid-cols-1">
        <Field label="When you went" hint="Optional.">
          <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Dishes" hint="Separate with commas.">
          <input value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder="Dan dan noodles, cucumber salad" className={inputClass} maxLength={1000} />
        </Field>
      </div>
      <Field label="Note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} h-auto py-2`} placeholder="Optional" />
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        {busy && <Spinner />}
        Save details
      </Button>
    </form>
  );
}
