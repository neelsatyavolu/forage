"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { TripSummary } from "./types";

export type TripsState = { status: "loading" } | { status: "unlinked" } | { status: "error"; message: string } | { status: "ready"; trips: TripSummary[] };

/** The linked Lodestar account's trips, or why there are none. */
export function useTrips(): TripsState {
  const [state, setState] = useState<TripsState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const link = await api<{ linked: boolean }>("/api/lodestar");
        if (!link.linked) return live && setState({ status: "unlinked" });
        const { trips } = await api<{ trips: TripSummary[] }>("/api/lodestar/trips");
        if (live) setState({ status: "ready", trips });
      } catch (err) {
        if (live) setState({ status: "error", message: err instanceof Error ? err.message : "Couldn't load your Lodestar trips." });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return state;
}
