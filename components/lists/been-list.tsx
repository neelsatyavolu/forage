"use client";

import { PlaceRow } from "@/components/place-row";
import { placeKind, shortAddress } from "@/lib/places/format";
import { OCCASION_LABEL, type Occasion } from "@/lib/types";
import { groupByOccasion } from "./been";
import type { BeenRow } from "./types";

const REACTION: Record<BeenRow["reaction"], string> = { loved: "Loved", fine: "Fine", disliked: "Didn't like" };

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Loved · Oct 2", or "Loved · Rated Nov 11" when the rating flow didn't ask the date. */
const noteFor = (r: BeenRow) => `${REACTION[r.reaction]} · ${r.dated ? "" : "Rated "}${formatDay(r.lastVisited)}${r.visits > 1 ? ` · ${r.visits} visits` : ""}`;

function Ranked({ rows, selectedId, onSelect }: { rows: BeenRow[]; selectedId: string | null; onSelect: (placeId: string) => void }) {
  return (
    <ol className="border-t border-hairline">
      {rows.map((r, i) => (
        <PlaceRow
          key={`${r.place.id}:${r.occasion}`}
          rank={i + 1}
          name={r.place.name}
          meta={[placeKind(r.place), shortAddress(r.place)].filter(Boolean).join(" · ")}
          note={noteFor(r)}
          score={r.score === null ? null : { value: r.score }}
          onOpen={() => onSelect(r.place.id)}
          selected={r.place.id === selectedId}
        />
      ))}
    </ol>
  );
}

/**
 * Ranked rows. Scores only compare within an occasion, so "All" shows one
 * ranked group per occasion rather than one list across them.
 */
export function BeenList({ rows, occasion, selectedId, onSelect }: { rows: BeenRow[]; occasion: Occasion | "all"; selectedId: string | null; onSelect: (placeId: string) => void }) {
  if (occasion !== "all") return <Ranked rows={rows} selectedId={selectedId} onSelect={onSelect} />;
  return (
    <div className="space-y-8">
      {groupByOccasion(rows).map((g) => (
        <section key={g.occasion}>
          <div className="flex items-baseline justify-between gap-4 pb-2 font-mono text-[12px]">
            <h3 className="text-ink">{OCCASION_LABEL[g.occasion]}</h3>
            <span className="text-mute">{g.rows.length}</span>
          </div>
          <Ranked rows={g.rows} selectedId={selectedId} onSelect={onSelect} />
        </section>
      ))}
    </div>
  );
}
