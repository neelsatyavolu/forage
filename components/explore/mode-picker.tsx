"use client";

import { MODES, type ExploreMode } from "./types";

/** Travel / Splurge / Stretch as a segmented control, with the chosen mode's one-line meaning beneath. */
export function ModePicker({ mode, onChange }: { mode: ExploreMode; onChange: (m: ExploreMode) => void }) {
  const hint = MODES.find((m) => m.id === mode)?.hint;
  return (
    <div>
      <div role="radiogroup" aria-label="Mode" className="inline-flex rounded-sm border border-field">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => onChange(m.id)}
            className={`h-9 cursor-pointer px-4 text-[14px] pointer-coarse:min-h-11 ${i > 0 ? "border-l border-field" : ""} ${mode === m.id ? "bg-wash font-medium text-accent" : "text-body hover:bg-hover"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-mute">{hint}</p>
    </div>
  );
}
