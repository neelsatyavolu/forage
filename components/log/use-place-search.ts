"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { LatLng, Place } from "@/lib/types";

const DEBOUNCE_MS = 300;

export type SearchState = { places: Place[]; loading: boolean; error: string | null; status: number | null };

/**
 * Search-as-you-type against /api/places. With no text and a location it
 * lists what's nearby instead. Older requests are aborted.
 */
export function usePlaceSearch(text: string, near: LatLng | null): SearchState {
  const q = text.trim();
  const params = new URLSearchParams(q ? { q } : { radiusKm: "1.5" });
  if (near) {
    params.set("lat", near.lat.toFixed(5));
    params.set("lng", near.lng.toFixed(5));
  }
  const key = q || near ? params.toString() : null;
  // The answer for the last finished request; it is loading while that isn't the current key.
  const [done, setDone] = useState<{ key: string; places: Place[]; error: string | null; status: number | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      api<{ places: Place[] }>(`/api/places?${key}`, { signal: ctl.signal })
        .then(({ places }) => setDone({ key, places, error: null, status: null }))
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setDone({ key, places: [], error: err instanceof Error ? err.message : "Search failed.", status: err instanceof ApiError ? err.status : null });
        });
    }, key.includes("q=") ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key]);

  if (!key) return { places: [], loading: false, error: null, status: null };
  if (done?.key !== key) return { places: done?.places ?? [], loading: true, error: null, status: null };
  return { places: done.places, loading: false, error: done.error, status: done.status };
}
