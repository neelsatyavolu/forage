"use client";

import { Segmented } from "@/components/segmented";
import { MODES, type ExploreMode } from "./types";

/** Travel / Splurge / Stretch, with the chosen mode's one-line meaning beneath. */
export function ModePicker({ mode, onChange }: { mode: ExploreMode; onChange: (m: ExploreMode) => void }) {
  const hint = MODES.find((m) => m.id === mode)?.hint;
  return (
    <div>
      <span className="mb-2 block font-mono text-[12px] text-mute">Mode</span>
      <Segmented label="Mode" options={MODES.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={onChange} />
      <p className="mt-2 text-[13px] text-mute">{hint}</p>
    </div>
  );
}
