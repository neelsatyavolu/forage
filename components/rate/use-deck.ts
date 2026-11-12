"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Spot } from "@/components/recs/use-location";
import { loadDeck, type DeckPlace } from "./api";

export type DeckState = { tiles: DeckPlace[]; hasMore: boolean; loading: boolean; error: string | null };

const EMPTY: DeckState = { tiles: [], hasMore: false, loading: false, error: null };

/** Pages of nearby places to rate around `spot`. "Show more" excludes everything already shown. */
export function useDeck(spot: Spot | null): DeckState & { more: () => void; retry: () => void } {
  const [state, setState] = useState<DeckState>(EMPTY);
  const shown = useRef<DeckPlace[]>([]);
  const ctl = useRef<AbortController | null>(null);
  const key = spot ? `${spot.lat.toFixed(4)},${spot.lng.toFixed(4)}` : null;

  const load = useCallback(
    (fresh: boolean) => {
      if (!spot) return;
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      const before = fresh ? [] : shown.current;
      setState((s) => ({ ...s, tiles: before, loading: true, error: null }));
      loadDeck(spot, before.map((d) => d.place.id), c.signal)
        .then((deck) => {
          shown.current = [...before, ...deck.places];
          setState({ tiles: shown.current, hasMore: deck.hasMore, loading: false, error: null });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Places didn't load." }));
        });
    },
    // The key stands for the spot; a new label alone doesn't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    load(true);
    return () => ctl.current?.abort();
  }, [load]);

  return { ...state, more: () => load(false), retry: () => load(shown.current.length === 0) };
}
