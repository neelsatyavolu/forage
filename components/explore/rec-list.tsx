"use client";

import Link from "next/link";
import type { Rec } from "@/lib/types";

const PRICE = ["$", "$$", "$$$", "$$$$"];

const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

function facts(r: Rec): string {
  const p = r.place;
  return [p.cuisine.slice(0, 2).join(", "), p.priceLevel ? PRICE[p.priceLevel - 1] : null, km(r.signals.distanceKm)].filter(Boolean).join(" · ");
}

/** Picks as hairline rows: name and facts left, the predicted score right, the reason beneath. */
export function RecList({ recs, onAdd }: { recs: Rec[]; onAdd: ((r: Rec) => void) | null }) {
  return (
    <ol className="border-t border-hairline">
      {recs.map((r) => (
        <li key={r.place.id} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-hairline py-4">
          <div className="min-w-0">
            <h3 className="text-[16px] font-medium">{r.place.name}</h3>
            <p className="mt-1 text-[13px] text-mute">
              {facts(r)}
              {r.signals.visited && <span className="ml-2 font-mono text-[12px]">Been</span>}
              {r.signals.wanted && <span className="ml-2 font-mono text-[12px]">Want to try</span>}
            </p>
          </div>
          <span className="font-mono text-[20px] leading-none text-ink tnum" aria-label={`Predicted score ${r.score.toFixed(1)} of 10`}>
            {r.score.toFixed(1)}
          </span>
          {r.reason && <p className="col-span-2 max-w-[60ch] font-serif text-[16px] leading-[1.5] text-body">{r.reason}</p>}
          <div className="col-span-2 mt-1 flex flex-wrap gap-x-4 text-[13px]">
            {r.place.address && <span className="text-mute">{r.place.address}</span>}
            <Link href={`/log?place=${encodeURIComponent(r.place.id)}`} className="text-accent hover:underline pointer-coarse:min-h-11">
              Log a visit
            </Link>
            {onAdd && (
              <button type="button" onClick={() => onAdd(r)} className="cursor-pointer text-accent hover:underline pointer-coarse:min-h-11">
                Add to trip
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
