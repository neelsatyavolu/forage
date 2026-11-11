"use client";

/** A row of mutually exclusive options. Uses the `field` border; the chosen one is ink on canvas. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap overflow-hidden rounded-sm border border-field">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-9 cursor-pointer px-3 text-[14px] font-medium pointer-coarse:h-11 ${i > 0 ? "border-l border-field" : ""} ${on ? "bg-primary text-primary-on" : "text-ink hover:bg-hover"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
