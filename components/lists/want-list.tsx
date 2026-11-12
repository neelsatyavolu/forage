"use client";

import { PlaceRow } from "@/components/place-row";
import { placeKind, shortAddress } from "@/lib/places/format";
import type { Place, WantItem } from "@/lib/types";

const SOURCE: Record<WantItem["source"], string> = { manual: "Added", rec: "From a pick", ask: "From Ask", import: "Imported", lodestar: "From Lodestar", rate: "From rating" };

export function WantList({ items, places, selectedId, onSelect }: { items: WantItem[]; places: Place[]; selectedId: string | null; onSelect: (placeId: string) => void }) {
  const byId = new Map(places.map((p) => [p.id, p]));
  return (
    <ul className="border-t border-hairline">
      {items.map((it) => {
        const place = byId.get(it.placeId);
        if (!place) return null;
        return (
          <PlaceRow
            key={it.placeId}
            name={place.name}
            meta={[placeKind(place), shortAddress(place)].filter(Boolean).join(" · ")}
            note={`${SOURCE[it.source]} ${new Date(it.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            onOpen={() => onSelect(place.id)}
            selected={place.id === selectedId}
          />
        );
      })}
    </ul>
  );
}
