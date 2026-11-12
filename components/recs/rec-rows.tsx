"use client";

import { useState } from "react";
import { PlaceDialog } from "@/components/lists/place-dialog";
import { PlaceRow, RowAction } from "@/components/place-row";
import { useRateSheet } from "@/components/rate/rate-sheet";
import { Button } from "@/components/ui";
import { del, post } from "@/lib/client";
import { distanceLabel, placeKind, priceLabel, shortAddress } from "@/lib/places/format";
import type { Rec, WantSource } from "@/lib/types";

const PAGE = 10;

/** "Cafe · $$ · 290 m · Grove St": what, price, how far, which street. */
export const recMeta = (r: Rec): string =>
  [placeKind(r.place), priceLabel(r.place.priceLevel), distanceLabel(r.signals.distanceKm), shortAddress(r.place), r.signals.visited ? "Been" : null].filter(Boolean).join(" · ");

/**
 * Picks as PlaceRows, 10 at a time. A row opens the place; under it, Want to
 * try (toggles), "Been? Rate it" (the + Rate sheet on that place) and, when
 * given, Add to trip. `rough` greys the scores while few places are rated.
 */
export function RecRows({ recs, source, rough = false, onAddToTrip, paged = true }: { recs: Rec[]; source: WantSource; rough?: boolean; onAddToTrip?: (r: Rec) => void; paged?: boolean }) {
  const sheet = useRateSheet();
  const [shown, setShown] = useState(PAGE);
  const [wanted, setWanted] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = paged ? recs.slice(0, shown) : recs;

  const toggleWant = async (r: Rec) => {
    const on = wanted[r.place.id] ?? r.signals.wanted;
    setWanted((w) => ({ ...w, [r.place.id]: !on }));
    setError(null);
    try {
      await (on ? del("/api/want", { placeId: r.place.id }) : post("/api/want", { placeId: r.place.id, source }));
    } catch (err) {
      setWanted((w) => ({ ...w, [r.place.id]: on }));
      setError(err instanceof Error ? err.message : "That didn't save.");
    }
  };

  return (
    <>
      {error && <p className="mb-2 font-mono text-[12px] text-danger">{error}</p>}
      <ol className="border-t border-hairline">
        {list.map((r) => {
          const isWanted = wanted[r.place.id] ?? r.signals.wanted;
          return (
            <PlaceRow
              key={r.place.id}
              name={r.place.name}
              meta={recMeta(r)}
              score={{ value: r.score, muted: rough, title: rough ? "Rough until you've rated 10 places" : `Predicted for you` }}
              reason={r.reason}
              onOpen={() => setOpen(r.place.id)}
              actions={
                <>
                  <RowAction onClick={() => toggleWant(r)} pressed={isWanted}>
                    {isWanted ? "Saved to Want to try" : "Want to try"}
                  </RowAction>
                  <RowAction onClick={() => sheet.open(r.place.id)}>{r.signals.visited ? "Rate again" : "Been? Rate it"}</RowAction>
                  {onAddToTrip && <RowAction onClick={() => onAddToTrip(r)}>Add to trip</RowAction>}
                </>
              }
            />
          );
        })}
      </ol>
      {paged && recs.length > shown && (
        <Button className="mt-6" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, recs.length - shown)} more
        </Button>
      )}
      <PlaceDialog placeId={open} onClose={() => setOpen(null)} onChanged={() => undefined} />
    </>
  );
}
