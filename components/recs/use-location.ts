"use client";

import { useCallback, useEffect, useState } from "react";

// Where Near me and Ask look: the browser's location, or a place the user
// picked when location is off. The last one is remembered in this browser.

export type Spot = { lat: number; lng: number; label: string };
export type LocationState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ready"; spot: Spot }
  | { status: "unavailable"; message: string };

const KEY = "forage:near-spot";

function remembered(): Spot | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Spot>) : null;
    return v && typeof v.lat === "number" && typeof v.lng === "number" && typeof v.label === "string" ? { lat: v.lat, lng: v.lng, label: v.label } : null;
  } catch {
    return null;
  }
}

function remember(spot: Spot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(spot));
  } catch {
    // Private windows can refuse storage; the spot still works for this visit.
  }
}

const REFUSED: Record<number, string> = {
  1: "Location is off for this site. Pick a place instead.",
  2: "Your location isn't available right now. Pick a place instead.",
  3: "Finding your location took too long. Pick a place instead.",
};

/** How a spot reads after "near": "you" for the device's location, else its name. */
export const nearLabel = (spot: Spot): string => (spot.label === "Your location" ? "you" : spot.label);

/** "37.77, -122.42" typed by hand, or null. */
export function parseLatLng(text: string): Spot | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` } : null;
}

/** True when the browser already allows location for this site, so asking shows no prompt. */
async function alreadyAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state === "granted";
  } catch {
    return false;
  }
}

/**
 * A failed fix keeps the spot already shown and says why in `notice`.
 * `prompt: false` never shows the browser's location prompt on its own: it
 * starts from the remembered spot and only refreshes it when location is
 * already allowed. The caller asks with `locate()` after saying why.
 */
export function useLocation({ prompt = true }: { prompt?: boolean } = {}): { state: LocationState; notice: string | null; locate: () => void; choose: (spot: Spot) => void } {
  const [state, setState] = useState<LocationState>({ status: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  const choose = useCallback((spot: Spot) => {
    remember(spot);
    setNotice(null);
    setState({ status: "ready", spot });
  }, []);

  const refuse = useCallback((message: string) => {
    setNotice(message);
    setState((prev) => (prev.status === "ready" ? prev : { status: "unavailable", message }));
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      refuse("This browser can't share its location. Pick a place instead.");
      return;
    }
    setState((prev) => (prev.status === "ready" ? prev : { status: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => choose({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location" }),
      (err) => refuse(REFUSED[err.code] ?? REFUSED[2]),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [choose, refuse]);

  useEffect(() => {
    const last = remembered();
    // Start from the last spot; a fresh fix replaces it when location is allowed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) setState({ status: "ready", spot: last });
    if (prompt) locate();
    else
      void alreadyAllowed().then((ok) => {
        if (ok) locate();
        else if (!last) setState({ status: "unavailable", message: "" });
      });
  }, [locate, prompt]);

  return { state, notice, locate, choose };
}
