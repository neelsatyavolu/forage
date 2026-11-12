"use client";

import type { Place, WantItem } from "@/lib/types";
import { placeLine } from "./been";

const SOURCE: Record<WantItem["source"], string> = { manual: "Added", rec: "From a pick", ask: "From Ask", import: "Imported", lodestar: "From Lodestar", rate: "From rating" };

export function WantList({ items, places, selectedId, onSelect }: { items: WantItem[]; places: Place[]; selectedId: string | null; onSelect: (placeId: string) => void }) {
  const byId = new Map(places.map((p) => [p.id, p]));
  return (
    <ul className="border-t border-hairline">
      {items.map((it) => {
        const place = byId.get(it.placeId);
        if (!place) return null;
        return (
          <li key={it.placeId} className="border-b border-hairline">
            <button
              type="button"
              onClick={() => onSelect(place.id)}
              aria-current={place.id === selectedId ? "true" : undefined}
              className="flex w-full cursor-pointer items-baseline justify-between gap-4 px-2 py-3 text-left hover:bg-hover aria-[current]:bg-wash"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
                <span className="block truncate text-[13px] text-mute">{placeLine(place)}</span>
              </span>
              <span className="shrink-0 font-mono text-[12px] text-mute">
                {SOURCE[it.source]} {new Date(it.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
