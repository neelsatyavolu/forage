"use client";

import { LocateFixed } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "@/components/recs/use-location";
import { Button, inputClass, Spinner } from "@/components/ui";
import { placeKind, shortAddress } from "@/lib/places/format";
import type { Place } from "@/lib/types";
import { usePlaceSearch } from "./use-place-search";

/**
 * A search box over OpenStreetMap places to eat or drink. With an empty box it
 * lists places near you (from the last known spot, without prompting; "Near
 * me" asks). Each result row ends with `action(place)`, or the whole row picks
 * the place when `onPick` is given.
 */
export function PlaceSearch({ onPick, action, placeholder = "Search for a restaurant, cafe or bar" }: { onPick?: (p: Place) => void; action?: (p: Place) => ReactNode; placeholder?: string }) {
  const [text, setText] = useState("");
  const { state, notice, locate } = useLocation({ prompt: false });
  const near = state.status === "ready" ? state.spot : null;
  const { places, loading, error } = usePlaceSearch(text, near);
  const listing = !text.trim() && near;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Search places" className={inputClass} autoComplete="off" />
        {!near && (
          <Button type="button" onClick={locate} disabled={state.status === "locating"} aria-label="List places near me">
            {state.status === "locating" ? <Spinner /> : <LocateFixed size={16} aria-hidden />}
            <span className="max-[480px]:hidden">Near me</span>
          </Button>
        )}
      </div>
      {notice && <p className="font-mono text-[12px] text-mute">{notice}</p>}
      {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
      {loading && places.length === 0 && <div className="skeleton h-24 rounded-sm" aria-label="Searching" />}
      {!loading && !error && places.length === 0 && (text.trim() || near) && (
        <p className="font-serif text-[18px] text-body">{text.trim() ? "No places by that name. Try fewer words or another spelling." : "No places to eat found within 1.5 km."}</p>
      )}
      {places.length > 0 && (
        <div>
          {listing && <p className="mb-2 font-mono text-[12px] text-mute">Places near you</p>}
          <ul className="border-t border-hairline-strong" aria-busy={loading}>
            {places.slice(0, 30).map((p) => (
              <li key={p.id} className="flex items-center gap-4 border-b border-hairline">
                {onPick ? (
                  <button type="button" onClick={() => onPick(p)} className="min-h-11 min-w-0 flex-1 cursor-pointer px-2 py-3 text-left hover:bg-hover">
                    <PlaceText place={p} />
                  </button>
                ) : (
                  <div className="min-w-0 flex-1 px-2 py-3">
                    <PlaceText place={p} />
                  </div>
                )}
                {action && <div className="shrink-0 pr-2">{action(p)}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PlaceText({ place }: { place: Place }) {
  return (
    <>
      <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
      <span className="block truncate text-[13px] text-mute">{[placeKind(place), shortAddress(place)].filter(Boolean).join(" · ")}</span>
    </>
  );
}
