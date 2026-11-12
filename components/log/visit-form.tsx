"use client";

import { useState } from "react";
import type { LogResponse } from "@/components/lists/types";
import { Button, Field, inputClass, Spinner } from "@/components/ui";
import { post } from "@/lib/client";
import type { Occasion, Place, Reaction } from "@/lib/types";
import { OCCASION_OPTIONS, parseDishes, REACTION_OPTIONS, today } from "./options";
import { PlaceText } from "./place-search";
import { Segmented } from "@/components/segmented";

/** Reaction, occasion, date, dishes and a note for one place. Calls onLogged with the server's answer. */
export function VisitForm({ place, onLogged, onChangePlace }: { place: Place; onLogged: (r: LogResponse) => void; onChangePlace: () => void }) {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [visitedOn, setVisitedOn] = useState(today);
  const [dishes, setDishes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reaction || !occasion) {
      setError("Pick how it was and what kind of meal it was.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onLogged(await post<LogResponse>("/api/visits", { placeId: place.id, visitedOn, reaction, occasion, dishes: parseDishes(dishes), note: note.trim() || null }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="flex items-start justify-between gap-4 border-y border-hairline-strong px-2 py-3">
        <div className="min-w-0">
          <PlaceText place={place} />
        </div>
        <Button type="button" variant="quiet" size="sm" onClick={onChangePlace}>
          Change
        </Button>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-mono text-[12px] text-mute">How was it</legend>
        <Segmented label="How was it" options={REACTION_OPTIONS} value={reaction} onChange={setReaction} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-mono text-[12px] text-mute">Occasion</legend>
        <Segmented label="Occasion" options={OCCASION_OPTIONS} value={occasion} onChange={setOccasion} />
      </fieldset>
      <div className="grid max-w-[560px] grid-cols-[180px_1fr] gap-6 max-[560px]:grid-cols-1">
        <Field label="Date">
          <input type="date" required value={visitedOn} max={today()} onChange={(e) => setVisitedOn(e.target.value)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Dishes" hint="Separate with commas.">
          <input value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder="Dan dan noodles, cucumber salad" className={inputClass} maxLength={1000} />
        </Field>
      </div>
      <div className="max-w-[560px]">
        <Field label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} h-auto py-2`} placeholder="Optional" />
        </Field>
      </div>
      {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
      <Button type="submit" variant="accent" disabled={busy}>
        {busy && <Spinner />}
        Save visit
      </Button>
    </form>
  );
}
