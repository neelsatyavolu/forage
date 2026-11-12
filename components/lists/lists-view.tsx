"use client";

import { useEffect, useMemo, useState } from "react";
import { PlaceMap } from "@/components/map/place-map";
import { RATED_EVENT } from "@/components/rate/quick-rate";
import { Segmented } from "@/components/segmented";
import { ButtonLink, EmptyState } from "@/components/ui";
import { OCCASION_LABEL, OCCASIONS, type Occasion } from "@/lib/types";
import { beenPins, beenRows, filterOccasion, occasionCounts, wantPins } from "./been";
import { BeenList } from "./been-list";
import { PlaceDialog } from "./place-dialog";
import { useLists } from "./use-lists";
import { WantList } from "./want-list";

type Tab = "been" | "want";
type View = "list" | "map";
const VIEW_KEY = "forage.lists.view";
const VIEWS: { value: View; label: string }[] = [
  { value: "list", label: "List" },
  { value: "map", label: "Map" },
];

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "map" ? "map" : "list";
  } catch {
    return "list";
  }
}

/** Been (ranked within each occasion) and Want to try, beside a map. On phones, List or Map. */
export function ListsView() {
  const { state, reload } = useLists();
  const [tab, setTab] = useState<Tab>("been");
  const [occasion, setOccasion] = useState<Occasion | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  useEffect(() => {
    // Stored per browser; read after mount so the server render matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(readView());
    const again = () => void reload();
    window.addEventListener(RATED_EVENT, again);
    return () => window.removeEventListener(RATED_EVENT, again);
  }, [reload]);

  const allRows = useMemo(() => (state.status === "ready" ? beenRows(state.been) : []), [state]);
  const rows = filterOccasion(allRows, occasion);
  const counts = occasionCounts(allRows);

  const header = (
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
            {t === "been" ? "Been" : "Want to try"}{" "}
            <span className="font-mono text-[12px] text-mute">{state.status === "ready" ? (t === "been" ? allRows.length : state.want.items.length) : ""}</span>
          </button>
        ))}
      </div>
      <ButtonLink href="/rate" variant="accent">
        Rate places
      </ButtonLink>
    </div>
  );

  if (state.status === "loading") return <div className="skeleton h-64 rounded-sm" aria-label="Loading your lists" />;
  if (state.status === "error") return <p className="font-mono text-[12px] text-danger">{state.message}</p>;
  if (state.status === "signed-out")
    return (
      <div className="space-y-8">
        {header}
        <EmptyState>Nothing rated yet. Rate places near you to start your list.</EmptyState>
      </div>
    );

  const want = state.want;
  const pins = tab === "been" ? beenPins(rows) : wantPins(want.places);
  const select = (id: string) => {
    setSelected(id);
    setOpen(id);
  };
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Private windows can refuse storage; the choice lasts for this page.
    }
  };
  const filters = [{ value: "all" as const, label: `All ${counts.all}` }, ...OCCASIONS.map((o) => ({ value: o, label: `${OCCASION_LABEL[o]} ${counts[o]}` }))];
  const hasRows = tab === "been" ? allRows.length > 0 : want.items.length > 0;

  return (
    <div className="space-y-8">
      {header}
      {(tab === "been" && allRows.length > 0) || hasRows ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {tab === "been" && allRows.length > 0 ? <Segmented label="Occasion" options={filters} value={occasion} onChange={setOccasion} /> : <span />}
          <div className="min-[901px]:hidden">
            <Segmented label="View" options={VIEWS} value={view} onChange={pickView} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-[7fr_5fr] gap-8 max-[900px]:grid-cols-1">
        <div className={`min-w-0 ${view === "map" && hasRows ? "max-[900px]:hidden" : ""}`}>
          {tab === "been" ? (
            allRows.length === 0 ? (
              <EmptyState>Nothing rated yet. Rate places near you to start your list.</EmptyState>
            ) : rows.length === 0 ? (
              <EmptyState>No {occasion === "all" ? "places" : OCCASION_LABEL[occasion].toLowerCase()} rated yet.</EmptyState>
            ) : (
              <BeenList rows={rows} occasion={occasion} selectedId={selected} onSelect={select} />
            )
          ) : want.items.length === 0 ? (
            <EmptyState>Nothing saved yet. Tap Want to try on any pick.</EmptyState>
          ) : (
            <WantList items={want.items} places={want.places} selectedId={selected} onSelect={select} />
          )}
        </div>
        <div className={`sticky top-[72px] h-[520px] overflow-hidden rounded-md border border-hairline max-[900px]:static max-[900px]:h-[60dvh] ${view === "list" || !hasRows ? "max-[900px]:hidden" : ""}`}>
          <PlaceMap pins={pins} selectedId={selected} onSelect={select} label={tab === "been" ? "Map of places you've rated" : "Map of places you want to try"} />
        </div>
      </div>

      <PlaceDialog placeId={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}
