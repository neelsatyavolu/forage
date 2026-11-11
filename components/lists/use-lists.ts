"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { VisitsResponse, WantResponse } from "./types";

export type ListsState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; been: VisitsResponse; want: WantResponse };

/** Both lists from the API. `reload` re-fetches after a change. */
export function useLists(): { state: ListsState; reload: () => Promise<void> } {
  const [state, setState] = useState<ListsState>({ status: "loading" });
  const reload = useCallback(async () => {
    try {
      const [been, want] = await Promise.all([api<VisitsResponse>("/api/visits"), api<WantResponse>("/api/want")]);
      setState({ status: "ready", been, want });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setState({ status: "signed-out" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Your lists didn't load." });
    }
  }, []);
  useEffect(() => {
    // Fetch on mount; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { state, reload };
}
