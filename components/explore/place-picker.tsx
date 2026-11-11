"use client";

import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui";
import { api } from "@/lib/client";
import { dateSpan, type Area, type TripSummary } from "./types";
import type { TripsState } from "./use-trips";

type Search = { status: "idle" } | { status: "loading" } | { status: "done"; areas: Area[] } | { status: "error"; message: string };

const row = "flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 border-b border-hairline px-2 py-2 text-left hover:bg-hover";

/** Search a city or neighborhood, or start from one of the linked Lodestar trips. */
export function PlacePicker({ trips, onArea, onTrip, busyTrip }: { trips: TripsState; onArea: (a: Area) => void; onTrip: (t: TripSummary) => void; busyTrip: string | null }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<Search>({ status: "idle" });

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearch({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearch({ status: "loading" });
      try {
        const { areas } = await api<{ areas: Area[] }>(`/api/explore/geocode?q=${encodeURIComponent(text)}`, { signal: ctl.signal });
        setSearch({ status: "done", areas });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSearch({ status: "error", message: err instanceof Error ? err.message : "Search failed." });
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const tripsReady = trips.status === "ready" && trips.trips.length > 0;
  return (
    <div className="grid gap-8 min-[900px]:grid-cols-[7fr_5fr]">
      <div>
        <label className="block">
          <span className="mb-2 block font-mono text-[12px] text-mute">City or neighborhood</span>
          <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lisbon, or Mission District" autoComplete="off" spellCheck={false} />
        </label>
        {search.status === "loading" && <div className="skeleton mt-4 h-11 rounded-sm" aria-label="Searching" />}
        {search.status === "error" && <p className="mt-2 font-mono text-[12px] text-danger">{search.message}</p>}
        {search.status === "done" &&
          (search.areas.length ? (
            <ul className="mt-4 border-t border-hairline">
              {search.areas.map((a) => (
                <li key={a.label}>
                  <button type="button" className={row} onClick={() => onArea(a)}>
                    <span className="text-[14px]">{a.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[14px] text-mute">No city or neighborhood by that name.</p>
          ))}
      </div>
      <div>
        <span className="mb-2 block font-mono text-[12px] text-mute">Your Lodestar trips</span>
        {trips.status === "loading" && <div className="skeleton h-11 rounded-sm" aria-label="Loading trips" />}
        {trips.status === "unlinked" && (
          <p className="text-[14px] text-body">
            <a href="/account" className="text-accent underline underline-offset-[3px]">
              Connect Lodestar
            </a>{" "}
            to explore around your trips.
          </p>
        )}
        {trips.status === "error" && <p className="font-mono text-[12px] text-danger">{trips.message}</p>}
        {trips.status === "ready" && !tripsReady && <p className="text-[14px] text-mute">No trips in Lodestar yet.</p>}
        {tripsReady && (
          <ul className="border-t border-hairline">
            {trips.trips.map((t) => (
              <li key={t.id}>
                <button type="button" className={row} onClick={() => onTrip(t)} disabled={busyTrip !== null || !t.destination}>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{t.title}</span>
                    <span className="block truncate text-[13px] text-mute">{t.destination ?? "No destination set"}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-mute tnum">{busyTrip === t.id ? "Finding" : (dateSpan(t.startDate, t.endDate) ?? "No dates")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
