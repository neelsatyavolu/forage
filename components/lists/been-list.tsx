"use client";

import { OCCASION_LABEL, type Occasion } from "@/lib/types";
import { placeLine } from "./been";
import type { BeenRow } from "./types";

const REACTION: Record<BeenRow["reaction"], string> = { loved: "Loved", fine: "Fine", disliked: "Didn't like" };

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Ranked rows: rank, name and what/where, then score in mono. */
export function BeenList({ rows, occasion, selectedId, onSelect }: { rows: BeenRow[]; occasion: Occasion | "all"; selectedId: string | null; onSelect: (placeId: string) => void }) {
  return (
    <ol className="border-t border-hairline">
      {rows.map((r, i) => (
        <li key={`${r.place.id}:${r.occasion}`} className="border-b border-hairline">
          <button
            type="button"
            onClick={() => onSelect(r.place.id)}
            aria-current={r.place.id === selectedId ? "true" : undefined}
            className="grid w-full cursor-pointer grid-cols-[32px_1fr_auto] items-baseline gap-4 px-2 py-3 text-left hover:bg-hover aria-[current]:bg-wash"
          >
            <span className="font-mono text-[12px] text-mute tabular-nums">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-ink">{r.place.name}</span>
              <span className="block truncate text-[13px] text-mute">
                {[placeLine(r.place), occasion === "all" ? OCCASION_LABEL[r.occasion] : null].filter(Boolean).join(" · ")}
              </span>
              <span className="block font-mono text-[12px] text-mute">
                {REACTION[r.reaction]} · {formatDay(r.lastVisited)}
                {r.visits > 1 ? ` · ${r.visits} visits` : ""}
              </span>
            </span>
            <span className="font-mono text-[20px] text-ink tabular-nums">{r.score === null ? "–" : r.score.toFixed(1)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
