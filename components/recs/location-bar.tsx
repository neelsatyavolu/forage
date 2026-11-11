"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, inputClass } from "../ui";
import { parseLatLng, type LocationState, type Spot } from "./use-location";

type Area = { label: string; lat: number; lng: number };
type Search = { status: "idle" } | { status: "loading" } | { status: "done"; areas: Area[] } | { status: "error"; message: string };

const row = "flex min-h-11 w-full cursor-pointer items-center border-b border-hairline px-2 py-2 text-left text-[14px] hover:bg-hover";

/** Where picks are centred, with "Use my location" and a place search as the fallback. */
export function LocationBar({ state, notice, onLocate, onChoose }: { state: LocationState; notice: string | null; onLocate: () => void; onChoose: (s: Spot) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const picking = open || state.status === "unavailable";

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2 || parseLatLng(text)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearch({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearch({ status: "loading" });
      try {
        // The city and neighborhood search Explore uses.
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

  const pick = (spot: Spot) => {
    onChoose(spot);
    setOpen(false);
    setQ("");
  };
  const typed = parseLatLng(q);
  const message = notice ?? (state.status === "unavailable" ? state.message : null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-[12px] text-mute">Near</span>
        <span className="text-[15px] text-ink">
          {state.status === "ready" ? state.spot.label : state.status === "locating" || state.status === "idle" ? "Finding your location" : "No location yet"}
        </span>
        <span className="flex gap-2">
          <Button size="sm" onClick={onLocate} disabled={state.status === "locating"}>
            Use my location
          </Button>
          {!picking && (
            <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
              Pick a place
            </Button>
          )}
        </span>
      </div>
      {message && <p className="mt-2 font-mono text-[12px] text-mute">{message}</p>}
      {picking && (
        <div className="mt-4 max-w-[480px]">
          <label className="block">
            <span className="mb-2 block font-mono text-[12px] text-mute">City, neighborhood, or lat, lng</span>
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mission District" autoComplete="off" spellCheck={false} />
          </label>
          {typed && (
            <ul className="mt-4 border-t border-hairline">
              <li>
                <button type="button" className={row} onClick={() => pick(typed)}>
                  Use {typed.label}
                </button>
              </li>
            </ul>
          )}
          {search.status === "loading" && <div className="skeleton mt-4 h-11 rounded-sm" aria-label="Searching" />}
          {search.status === "error" && <p className="mt-2 font-mono text-[12px] text-danger">{search.message}</p>}
          {search.status === "done" &&
            (search.areas.length ? (
              <ul className="mt-4 border-t border-hairline">
                {search.areas.map((a) => (
                  <li key={a.label}>
                    <button type="button" className={row} onClick={() => pick({ lat: a.lat, lng: a.lng, label: a.label })}>
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[14px] text-mute">No place by that name.</p>
            ))}
        </div>
      )}
    </div>
  );
}
