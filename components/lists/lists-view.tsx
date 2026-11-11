"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignInNote } from "@/components/log/sign-in-note";
import { PlaceMap } from "@/components/map/place-map";
import { EmptyState } from "@/components/ui";
import { OCCASION_LABEL, OCCASIONS, type Occasion } from "@/lib/types";
import { beenPins, beenRows, filterOccasion, occasionCounts, wantPins } from "./been";
import { BeenList } from "./been-list";
import { PlaceDialog } from "./place-dialog";
import { useLists } from "./use-lists";
import { WantList } from "./want-list";

type Tab = "been" | "want";

const linkButton = "inline-flex h-9 items-center rounded-sm px-4 text-[14px] font-medium pointer-coarse:min-h-11";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 cursor-pointer items-center rounded-full border px-3 font-mono text-[12px] pointer-coarse:h-11 ${on ? "border-accent bg-wash text-ink" : "border-hairline-strong text-mute hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/** Been (ranked, by occasion) and Want to try, beside a map of the same places. */
export function ListsView() {
  const { state, reload } = useLists();
  const [tab, setTab] = useState<Tab>("been");
  const [occasion, setOccasion] = useState<Occasion | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const allRows = useMemo(() => (state.status === "ready" ? beenRows(state.been) : []), [state]);
  const rows = filterOccasion(allRows, occasion);
  const counts = occasionCounts(allRows);

  if (state.status === "loading") return <div className="h-64 animate-pulse rounded-sm bg-hover" aria-label="Loading your lists" />;
  if (state.status === "signed-out") return <SignInNote>Sign in to see the places you&apos;ve been and want to try.</SignInNote>;
  if (state.status === "error") return <p className="font-mono text-[12px] text-danger">{state.message}</p>;

  const want = state.want;
  const pins = tab === "been" ? beenPins(rows) : wantPins(want.places);
  const select = (id: string) => {
    setSelected(id);
    setOpen(id);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Lists" className="flex gap-6">
          {(["been", "want"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setSelected(null);
              }}
              className={`h-9 cursor-pointer text-[15px] font-medium pointer-coarse:h-11 ${tab === t ? "text-ink underline decoration-accent decoration-2 underline-offset-[10px]" : "text-mute hover:text-ink"}`}
            >
              {t === "been" ? "Been" : "Want to try"} <span className="font-mono text-[12px] text-mute">{t === "been" ? allRows.length : want.items.length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href="/log/quick" className={`${linkButton} text-mute hover:text-ink`}>
            Quick start
          </Link>
          <Link href="/log" className={`${linkButton} bg-accent text-accent-on hover:bg-accent-hover`}>
            Log a visit
          </Link>
        </div>
      </div>

      {tab === "been" && allRows.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Filter by occasion">
          <Pill on={occasion === "all"} onClick={() => setOccasion("all")}>
            All {counts.all}
          </Pill>
          {OCCASIONS.map((o) => (
            <Pill key={o} on={occasion === o} onClick={() => setOccasion(o)}>
              {OCCASION_LABEL[o]} {counts[o]}
            </Pill>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[7fr_5fr] gap-8 max-[900px]:grid-cols-1">
        <div className="min-w-0">
          {tab === "been" ? (
            allRows.length === 0 ? (
              <EmptyState action={<Link href="/log/quick" className={`${linkButton} border border-hairline-strong text-ink hover:bg-hover`}>Add places you love</Link>}>
                Nothing logged yet. Add a few places you already like to get started.
              </EmptyState>
            ) : rows.length === 0 ? (
              <EmptyState>No places logged as {occasion === "all" ? "anything" : OCCASION_LABEL[occasion].toLowerCase()} yet.</EmptyState>
            ) : (
              <BeenList rows={rows} occasion={occasion} selectedId={selected} onSelect={select} />
            )
          ) : want.items.length === 0 ? (
            <EmptyState>Nothing saved to try yet. Open a place and add it to this list.</EmptyState>
          ) : (
            <WantList items={want.items} places={want.places} selectedId={selected} onSelect={select} />
          )}
        </div>
        <div className="sticky top-[72px] h-[520px] overflow-hidden rounded-md border border-hairline max-[900px]:static max-[900px]:order-first max-[900px]:h-[320px]">
          <PlaceMap pins={pins} selectedId={selected} onSelect={select} label={tab === "been" ? "Map of places you've been" : "Map of places you want to try"} />
        </div>
      </div>

      <PlaceDialog placeId={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}
