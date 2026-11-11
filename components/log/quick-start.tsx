"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { post } from "@/lib/client";
import { OCCASION_LABEL, type Occasion, type Place } from "@/lib/types";
import { OCCASION_OPTIONS, today } from "./options";
import { PlaceSearch } from "./place-search";
import { Segmented } from "./segmented";

type Added = { place: Place; occasion: Occasion };

/**
 * Onboarding: add places you love in one tap each. Each is logged as
 * "loved" today under the chosen occasion, with no comparisons; the scores
 * sort themselves out as you log real visits later.
 */
export function QuickStart() {
  const [occasion, setOccasion] = useState<Occasion>("casual");
  const [added, setAdded] = useState<Added[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdded = (p: Place) => added.some((a) => a.place.id === p.id && a.occasion === occasion);

  const add = async (place: Place) => {
    setBusy(place.id);
    setError(null);
    try {
      await post("/api/visits", { placeId: place.id, visitedOn: today(), reaction: "loved", occasion, dishes: [], note: null });
      setAdded((list) => [{ place, occasion }, ...list]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-mono text-[12px] text-mute">Add them as</legend>
          <Segmented label="Occasion" options={OCCASION_OPTIONS} value={occasion} onChange={setOccasion} />
        </fieldset>
        {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
        <PlaceSearch
          placeholder="Search a place you love"
          action={(p) =>
            isAdded(p) ? (
              <span className="inline-flex h-8 items-center gap-1 px-3 font-mono text-[12px] text-mute">
                <Check size={14} aria-hidden /> Added
              </span>
            ) : (
              <Button size="sm" onClick={() => add(p)} disabled={busy !== null} aria-label={`Add ${p.name}`}>
                {busy === p.id && <Spinner />}
                Add
              </Button>
            )
          }
        />
      </div>
      <section className="border-t border-hairline-strong pt-3">
        <div className="flex items-baseline justify-between gap-4 font-mono text-[12px]">
          <h2 className="text-ink">Added</h2>
          <span className="text-mute">{added.length}</span>
        </div>
        {added.length === 0 ? (
          <p className="mt-6 font-serif text-[18px] text-body">Places you add show here.</p>
        ) : (
          <ul className="mt-6 border-t border-hairline">
            {added.map((a) => (
              <li key={`${a.place.id}:${a.occasion}`} className="flex items-baseline justify-between gap-4 border-b border-hairline px-2 py-3">
                <span className="truncate text-[15px]">{a.place.name}</span>
                <span className="shrink-0 font-mono text-[12px] text-mute">{OCCASION_LABEL[a.occasion]}</span>
              </li>
            ))}
          </ul>
        )}
        {added.length > 0 && (
          <Link href="/lists" className="mt-6 inline-flex h-9 items-center rounded-sm bg-accent px-4 text-[14px] font-medium text-accent-on hover:bg-accent-hover pointer-coarse:min-h-11">
            Done
          </Link>
        )}
      </section>
    </div>
  );
}
