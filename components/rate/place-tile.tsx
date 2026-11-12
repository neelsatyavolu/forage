"use client";

import { Bookmark, Check, X } from "lucide-react";
import { distanceLabel } from "@/lib/places/format";
import type { Candidate } from "./flow";
import type { Mark } from "./use-rate-flow";

export type TileState = "none" | "been" | "rated" | Mark;

const iconButton = "inline-flex size-9 cursor-pointer items-center justify-center rounded-sm text-mute hover:bg-hover hover:text-ink disabled:cursor-default pointer-coarse:size-11";

/**
 * One nearby place. The whole tile toggles Been; two small buttons mark Want
 * to try or Not been, which save at once. `score` shows for a place already rated.
 */
export function PlaceTile({ c, state, score, busy, onBeen, onMark }: { c: Candidate; state: TileState; score: number | null; busy: boolean; onBeen: () => void; onMark: (m: Mark) => void }) {
  const been = state === "been" || state === "rated";
  const faded = state === "want";
  const meta = [c.kind, c.distanceKm !== null ? distanceLabel(c.distanceKm) : null].filter(Boolean).join(" · ");
  return (
    <li className={`relative flex min-h-28 flex-col rounded-sm border ${been ? "border-accent bg-wash" : "border-hairline-strong"} ${faded ? "opacity-60" : ""}`}>
      <button
        type="button"
        data-tile={c.place.id}
        aria-pressed={been}
        disabled={state === "rated" || state === "want"}
        onClick={onBeen}
        className="flex flex-1 cursor-pointer flex-col items-start gap-1 rounded-sm p-3 pb-12 text-left hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-ink">{c.place.name}</span>
        <span className="font-mono text-[12px] text-mute">{meta}</span>
      </button>
      <div className="pointer-events-none absolute inset-x-1 bottom-1 flex items-center justify-between gap-2 pl-2">
        <span className="font-mono text-[12px] text-ink">
          {state === "rated" && score !== null ? (
            <span className="tabular-nums">Rated {score.toFixed(1)}</span>
          ) : been ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Check size={14} aria-hidden /> Been
            </span>
          ) : state === "want" ? (
            <span className="text-mute">Want to try</span>
          ) : null}
        </span>
        {state === "none" && (
          <span className="pointer-events-auto flex">
            <button type="button" className={iconButton} disabled={busy} onClick={() => onMark("want")} aria-label={`Want to try ${c.place.name}`} title="Want to try (W)">
              <Bookmark size={16} aria-hidden />
            </button>
            <button type="button" className={iconButton} disabled={busy} onClick={() => onMark("skip")} aria-label={`Not been to ${c.place.name}`} title="Not been (S)">
              <X size={16} aria-hidden />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
