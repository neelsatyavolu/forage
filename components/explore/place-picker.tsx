"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AreaSearch } from "@/components/recs/area-search";
import { dateSpan, type Area, type TripSummary } from "./types";
import type { TripsState } from "./use-trips";

const RECENT_KEY = "forage.explore.recent";
const RECENT_MAX = 3;

const chip = "inline-flex h-8 max-w-full cursor-pointer items-center gap-2 truncate rounded-full border border-hairline-strong px-3 font-mono text-[12px] text-ink hover:bg-hover disabled:cursor-default disabled:text-stone pointer-coarse:h-11";

function readRecent(): Area[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Area[]).filter((a) => typeof a?.lat === "number" && typeof a?.name === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Remembers an area at the front of the recent list (this browser only). */
export function rememberArea(a: Area): void {
  try {
    const next = [a, ...readRecent().filter((r) => r.label !== a.label)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage; recent areas are only a shortcut.
  }
}

/** Search a city or neighborhood; under it, Lodestar trips and the last three areas as chips. */
export function PlacePicker({ trips, onArea, onTrip, busyTrip }: { trips: TripsState; onArea: (a: Area) => void; onTrip: (t: TripSummary) => void; busyTrip: string | null }) {
  const [recent, setRecent] = useState<Area[]>([]);
  // Read after mount: storage isn't there during the server render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(readRecent()), []);
  const tripList = trips.status === "ready" ? trips.trips.filter((t) => t.destination) : [];
  return (
    <div className="space-y-4">
      <AreaSearch
        label="Where"
        placeholder="Lisbon, or Mission District"
        onArea={onArea}
        onChoose={(s) => onArea({ label: s.label, name: s.label, lat: s.lat, lng: s.lng, radiusKm: 2 })}
      />
      {tripList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-mute">Trips</span>
          {tripList.map((t) => (
            <button key={t.id} type="button" className={chip} onClick={() => onTrip(t)} disabled={busyTrip !== null}>
              {t.destination}
              {dateSpan(t.startDate, t.endDate) && <span className="text-mute">{busyTrip === t.id ? "Finding" : dateSpan(t.startDate, t.endDate)}</span>}
            </button>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-mute">Recent</span>
          {recent.map((a) => (
            <button key={a.label} type="button" className={chip} onClick={() => onArea(a)}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      {trips.status === "unlinked" && (
        <p className="text-[13px] text-mute">
          Plan around a trip?{" "}
          <Link href="/account" className="text-accent underline underline-offset-[3px]">
            Connect Lodestar in You
          </Link>
          .
        </p>
      )}
      {trips.status === "error" && <p className="font-mono text-[12px] text-danger">{trips.message}</p>}
    </div>
  );
}
