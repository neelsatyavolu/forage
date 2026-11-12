"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RATED_EVENT } from "@/components/rate/quick-rate";
import { RatePrompt } from "@/components/rate/rate-prompt";
import { Segmented } from "@/components/segmented";
import { ButtonLink, EmptyState, SectionRule } from "@/components/ui";
import { post } from "@/lib/client";
import { FIRST_PICKS_AT, RATE_GOAL, type Progress, type Rec } from "@/lib/types";
import { useAccount } from "../account/use-account";
import { AskBox } from "./ask-box";
import { LocationRow } from "./location-row";
import { RecRows } from "./rec-rows";
import { useLocation } from "./use-location";

type Filter = "new" | "goto";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "Something new" },
  { value: "goto", label: "Go-to" },
];
const EMPTY: Record<Filter, string> = {
  new: "Nothing new within 2 km. Try another area.",
  goto: "No go-tos near here yet. Places you rate Loved it show up here.",
};

type Load = { status: "idle" } | { status: "loading" } | { status: "ready"; recs: Rec[]; reasons: boolean } | { status: "error"; message: string };

const NOBODY: Progress = { rated: 0, firstPicksAt: FIRST_PICKS_AT, goal: RATE_GOAL };

/** Near me: the rate prompt until 10, where, Ask, then picks (from 5 rated). */
export function NearMe() {
  const { state: account, refresh } = useAccount();
  const progress = account.status === "signed-in" ? account.progress : NOBODY;
  const ready = progress.rated >= FIRST_PICKS_AT;
  // Location is only asked for once there are picks to show.
  const { state: location, notice, locate, choose } = useLocation({ prompt: ready });
  const askFocus = useSearchParams().get("ask") === "1";
  const [filter, setFilter] = useState<Filter>("new");
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const spot = location.status === "ready" ? location.spot : null;

  // A rating from the + Rate sheet changes the count and the picks.
  useEffect(() => {
    const again = () => void refresh();
    window.addEventListener(RATED_EVENT, again);
    return () => window.removeEventListener(RATED_EVENT, again);
  }, [refresh]);

  useEffect(() => {
    if (!ready || !spot) return;
    const ctl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad({ status: "loading" });
    post<{ recs: Rec[]; reasons: boolean }>("/api/recs", { lat: spot.lat, lng: spot.lng, radiusKm: 2, filter }, ctl.signal)
      .then((r) => setLoad({ status: "ready", ...r }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoad({ status: "error", message: err instanceof Error ? err.message : "Couldn't load picks." });
      });
    return () => ctl.abort();
  }, [ready, spot?.lat, spot?.lng, filter, progress.rated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (account.status === "loading") return <div className="skeleton h-40 rounded-sm" aria-label="Loading" />;

  return (
    <>
      <RatePrompt progress={progress} />
      {!ready ? (
        <EmptyState>Rate {FIRST_PICKS_AT} places to get picks.</EmptyState>
      ) : (
        <>
          <div className="space-y-6">
            <LocationRow state={location} notice={notice} onLocate={locate} onChoose={choose} action={progress.rated >= RATE_GOAL ? <ButtonLink href="/rate" size="sm">Rate places</ButtonLink> : undefined} />
            <AskBox spot={spot} focus={askFocus} />
          </div>
          <SectionRule label="Picks" meta={load.status === "ready" ? `${load.recs.length} ${load.recs.length === 1 ? "pick" : "picks"}` : undefined}>
            <div className="mb-8">
              <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
            </div>
            {!spot && <EmptyState>Share your location or pick a place to see what&apos;s near.</EmptyState>}
            {spot && load.status === "loading" && <div className="skeleton h-48 rounded-sm" aria-label="Loading picks" />}
            {load.status === "error" && <p className="font-mono text-[12px] text-danger">{load.message}</p>}
            {spot && load.status === "ready" && (load.recs.length ? <RecRows key={`${filter}:${spot.lat}`} recs={load.recs} source="rec" rough={progress.rated < RATE_GOAL} /> : <EmptyState>{EMPTY[filter]}</EmptyState>)}
            {load.status === "ready" && load.recs.length > 0 && !load.reasons && (
              <p className="mt-4 text-[13px] text-mute">
                <Link href="/account" className="text-accent underline underline-offset-[3px]">
                  Connect ChatGPT or Grok in You
                </Link>{" "}
                to get a reason with each pick.
              </p>
            )}
          </SectionRule>
        </>
      )}
    </>
  );
}
