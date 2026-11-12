"use client";

import { Check } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { usePlaceSearch } from "@/components/log/use-place-search";
import { nearLabel, type Spot } from "@/components/recs/use-location";
import { Button, inputClass } from "@/components/ui";
import { fromDeck, fromSearch, type Candidate, type Rated } from "./flow";
import { PlaceTile, type TileState } from "./place-tile";
import type { DeckState } from "./use-deck";
import type { Mark } from "./use-rate-flow";

type Props = {
  spot: Spot;
  deck: DeckState & { more: () => void; retry: () => void };
  queue: readonly Candidate[];
  marks: Readonly<Record<string, Mark>>;
  rated: Readonly<Record<string, Rated>>;
  busy: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onChangeSpot: () => void;
  onBeen: (c: Candidate) => void;
  onMark: (c: Candidate, m: Mark) => void;
};

/** Grid columns as laid out right now, for arrow keys. */
const columns = (grid: HTMLElement) => getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;

/** Step A: nearby places as tiles. Tap every one you've been to; search covers places not shown. */
export function PickGrid({ spot, deck, queue, marks, rated, busy, searchRef, onChangeSpot, onBeen, onMark }: Props) {
  const [text, setText] = useState("");
  const grid = useRef<HTMLUListElement>(null);
  const tiles = deck.tiles.map(fromDeck).filter((c) => marks[c.place.id] !== "skip");
  const stateOf = (id: string): TileState => (rated[id] ? "rated" : marks[id] ? marks[id] : queue.some((q) => q.place.id === id) ? "been" : "none");

  // Arrow keys move between tiles; W and S mark the focused one.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const el = e.target as HTMLElement;
    const id = el.dataset.tile;
    if (!id || !grid.current) return;
    const buttons = [...grid.current.querySelectorAll<HTMLButtonElement>("[data-tile]")];
    const at = buttons.indexOf(el as HTMLButtonElement);
    const cols = columns(grid.current);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      buttons[Math.min(buttons.length - 1, Math.max(0, at + move))]?.focus();
      return;
    }
    const c = tiles.find((t) => t.place.id === id);
    const key = e.key.toLowerCase();
    if (c && stateOf(id) === "none" && (key === "w" || key === "s" || key === "x")) {
      e.preventDefault();
      e.stopPropagation();
      onMark(c, key === "w" ? "want" : "skip");
      buttons[at + 1]?.focus();
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.01em] max-[720px]:text-[30px]">Which of these have you been to?</h1>
        <p className="mt-3 font-serif text-[18px] leading-[1.6] text-body">
          Places near {nearLabel(spot)}. Tap every one you&apos;ve been to.{" "}
          <button type="button" onClick={onChangeSpot} className="cursor-pointer font-sans text-[14px] text-accent underline underline-offset-[3px]">
            Change
          </button>
        </p>
      </div>

      <div>
        <input
          ref={searchRef}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search a place not shown"
          aria-label="Search a place not shown"
          className={`${inputClass} max-w-[480px]`}
          autoComplete="off"
        />
        {text.trim() && <SearchResults text={text} spot={spot} stateOf={stateOf} busy={busy} onBeen={onBeen} onMark={onMark} />}
      </div>

      {deck.error && (
        <div className="space-y-2">
          <p className="font-mono text-[12px] text-danger">{deck.error}</p>
          <Button size="sm" onClick={deck.retry}>
            Try again
          </Button>
        </div>
      )}

      {tiles.length > 0 && (
        <ul ref={grid} onKeyDown={onKeyDown} className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-3 max-[560px]:grid-cols-2" aria-label="Places near you">
          {tiles.map((c) => (
            <PlaceTile key={c.place.id} c={c} state={stateOf(c.place.id)} score={rated[c.place.id]?.score ?? null} busy={busy} onBeen={() => onBeen(c)} onMark={(m) => onMark(c, m)} />
          ))}
        </ul>
      )}
      {deck.loading && (
        <ul className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-3 max-[560px]:grid-cols-2" aria-label="Loading places">
          {Array.from({ length: tiles.length ? 4 : 12 }, (_, i) => (
            <li key={i} className="skeleton h-28 rounded-sm" />
          ))}
        </ul>
      )}
      {!deck.loading && !deck.error && tiles.length === 0 && (
        <p className="font-serif text-[18px] text-body">No places found near {nearLabel(spot)} yet. Search for one by name, or change the area.</p>
      )}
      {!deck.loading && deck.hasMore && (
        <Button onClick={deck.more}>Show more places</Button>
      )}
    </div>
  );
}

function SearchResults({ text, spot, stateOf, busy, onBeen, onMark }: { text: string; spot: Spot; stateOf: (id: string) => TileState; busy: boolean; onBeen: (c: Candidate) => void; onMark: (c: Candidate, m: Mark) => void }) {
  const { places, loading, error } = usePlaceSearch(text, spot);
  if (error) return <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>;
  if (loading && places.length === 0) return <div className="skeleton mt-4 h-11 max-w-[640px] rounded-sm" aria-label="Searching" />;
  if (places.length === 0) return <p className="mt-4 text-[14px] text-mute">No places by that name.</p>;
  return (
    <ul className="mt-4 max-w-[640px] border-t border-hairline">
      {places.slice(0, 8).map((p) => {
        const c = fromSearch(p, spot);
        const s = stateOf(p.id);
        return (
          <li key={p.id} className="flex min-h-12 items-center justify-between gap-4 border-b border-hairline px-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{p.name}</span>
              <span className="block truncate text-[13px] text-mute">{[c.kind, p.address?.split(",")[0]].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              {s === "rated" || s === "want" || s === "skip" ? (
                <span className="font-mono text-[12px] text-mute">{s === "rated" ? "Rated" : s === "want" ? "Want to try" : "Not been"}</span>
              ) : (
                <>
                  <Button size="sm" variant="ghost" className={s === "been" ? "border-accent bg-wash" : ""} aria-pressed={s === "been"} onClick={() => onBeen(c)}>
                    {s === "been" && <Check size={14} aria-hidden />}
                    Been
                  </Button>
                  <Button size="sm" variant="quiet" disabled={busy} onClick={() => onMark(c, "want")}>
                    Want to try
                  </Button>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
