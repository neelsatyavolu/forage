"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "../ui";
import { AreaSearch } from "./area-search";
import { nearLabel, type LocationState, type Spot } from "./use-location";

/** "Near you · Change", with the area search behind Change, and room for one action at the right. */
export function LocationRow({ state, notice, onLocate, onChoose, action }: { state: LocationState; notice: string | null; onLocate: () => void; onChoose: (s: Spot) => void; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ready = state.status === "ready";
  const message = notice ?? (state.status === "unavailable" ? state.message : null);
  const searching = open || state.status === "unavailable";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[15px] text-ink">
          {ready ? (
            <>
              Near <span className="font-medium">{nearLabel(state.spot)}</span>
            </>
          ) : state.status === "unavailable" ? (
            "Pick where to look"
          ) : (
            "Finding your location"
          )}
        </p>
        {ready && !open && (
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-[14px] text-accent hover:underline pointer-coarse:min-h-11">
            Change
          </button>
        )}
        {(!ready || open) && (
          <Button size="sm" onClick={onLocate} disabled={state.status === "locating"}>
            Use my location
          </Button>
        )}
        {open && (
          <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {message && <p className="mt-2 font-mono text-[12px] text-mute">{message}</p>}
      {searching && (
        <div className="mt-4">
          <AreaSearch
            onChoose={(s) => {
              onChoose(s);
              setOpen(false);
            }}
            autoFocus={open}
          />
        </div>
      )}
    </div>
  );
}
