"use client";

import { useState } from "react";
import { AreaSearch } from "@/components/recs/area-search";
import type { LocationState, Spot } from "@/components/recs/use-location";
import { Button, Spinner } from "@/components/ui";

/** Before the grid: why Forage wants a location, then the browser prompt only on request, or a city search. */
export function WhereStep({ state, notice, searchFirst, onLocate, onChoose }: { state: LocationState; notice: string | null; searchFirst: boolean; onLocate: () => void; onChoose: (s: Spot) => void }) {
  const [searching, setSearching] = useState(searchFirst);
  const failed = notice !== null || (state.status === "unavailable" && state.message !== "");
  return (
    <div className="max-w-[640px] space-y-8">
      <div>
        <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.01em] max-[720px]:text-[30px]">Rate places you&apos;ve been</h1>
        <p className="mt-3 font-serif text-[18px] leading-[1.6] text-body">Forage lists places near you to rate. Your location isn&apos;t saved.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={onLocate} disabled={state.status === "locating"}>
          {state.status === "locating" && <Spinner />}
          Use my location
        </Button>
        {!searching && <Button onClick={() => setSearching(true)}>Search a city instead</Button>}
      </div>
      {failed && <p className="font-mono text-[12px] text-mute">{notice ?? (state.status === "unavailable" ? state.message : "")}</p>}
      {(searching || failed) && <AreaSearch onChoose={onChoose} autoFocus={searching} />}
    </div>
  );
}
