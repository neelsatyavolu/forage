"use client";

import { LocateFixed } from "lucide-react";
import { useState, type ReactNode } from "react";
import { placeLine } from "@/components/lists/been";
import { Button, inputClass, Spinner } from "@/components/ui";
import type { Place } from "@/lib/types";
import { SignInNote } from "./sign-in-note";
import { useLocation, usePlaceSearch } from "./use-place-search";

/**
 * A search box over OpenStreetMap places to eat or drink, with "Near me" to
 * list what's around. Each result row ends with `action(place)`, or the whole
 * row picks the place when `onPick` is given.
 */
export function PlaceSearch({ onPick, action, placeholder = "Search for a restaurant, cafe or bar" }: { onPick?: (p: Place) => void; action?: (p: Place) => ReactNode; placeholder?: string }) {
  const [text, setText] = useState("");
  const { near, locating, error: geoError, locate } = useLocation();
  const { places, loading, error, status } = usePlaceSearch(text, near);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Search places"
          className={inputClass}
          autoComplete="off"
        />
        <Button type="button" onClick={locate} disabled={locating} aria-label="Search near me">
          {locating ? <Spinner /> : <LocateFixed size={16} aria-hidden />}
          <span className="max-[480px]:hidden">Near me</span>
        </Button>
      </div>
      {geoError && <p className="font-mono text-[12px] text-danger">{geoError}</p>}
      {status === 401 ? (
        <SignInNote>Sign in to search and log places.</SignInNote>
      ) : error ? (
        <p className="font-mono text-[12px] text-danger">{error}</p>
      ) : null}
      {loading && places.length === 0 && <p className="font-mono text-[12px] text-mute">Searching</p>}
      {!loading && !error && places.length === 0 && (text.trim() || near) && (
        <p className="font-serif text-[18px] text-body">{text.trim() ? "No places by that name. Try fewer words or another spelling." : "No places to eat found within 1.5 km."}</p>
      )}
      {places.length > 0 && (
        <ul className="border-t border-hairline-strong" aria-busy={loading}>
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-4 border-b border-hairline">
              {onPick ? (
                <button type="button" onClick={() => onPick(p)} className="min-w-0 flex-1 cursor-pointer px-2 py-3 text-left hover:bg-hover">
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
      )}
    </div>
  );
}

export function PlaceText({ place }: { place: Place }) {
  return (
    <>
      <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
      <span className="block truncate text-[13px] text-mute">{placeLine(place) || "Place to eat"}</span>
    </>
  );
}
