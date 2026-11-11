"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RecList } from "@/components/explore/rec-list";
import { Segmented } from "@/components/log/segmented";
import { post } from "@/lib/client";
import type { Rec } from "@/lib/types";
import { useAccount } from "../account/use-account";
import { EmptyState, SectionRule } from "../ui";
import { LocationBar } from "./location-bar";
import { TastePanel } from "./taste-panel";
import { useLocation } from "./use-location";

type Filter = "new" | "goto";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "Something new" },
  { value: "goto", label: "Go-to" },
];
const EMPTY: Record<Filter, string> = {
  new: "Nothing new within 2 km yet. Try another place, or check back once the map has loaded more spots.",
  goto: "No go-tos near here yet. Places you log as loved show up here.",
};

type Load = { status: "idle" } | { status: "loading" } | { status: "ready"; recs: Rec[]; reasons: boolean } | { status: "error"; message: string };

export function NearMe() {
  const { state: account } = useAccount();
  const { state: location, notice, locate, choose } = useLocation();
  const [filter, setFilter] = useState<Filter>("new");
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const spot = location.status === "ready" ? location.spot : null;
  const signedIn = account.status === "signed-in";

  useEffect(() => {
    if (!signedIn || !spot) return;
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
  }, [signedIn, spot?.lat, spot?.lng, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (account.status === "loading") return <div className="skeleton h-40 rounded-sm" aria-label="Loading" />;
  if (account.status === "signed-out")
    return (
      <EmptyState action={<Link href="/account" className="inline-flex h-9 items-center rounded-sm border border-hairline-strong px-4 text-[14px] font-medium hover:bg-hover pointer-coarse:min-h-11">Sign in</Link>}>
        Sign in to get picks based on the places you have eaten.
      </EmptyState>
    );

  const meta = load.status === "ready" ? `${load.recs.length} ${load.recs.length === 1 ? "pick" : "picks"}` : undefined;
  return (
    <>
      <LocationBar state={location} notice={notice} onLocate={locate} onChoose={choose} />
      <SectionRule label="Picks" meta={meta}>
        <div className="mb-8">
          <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        {!spot && <EmptyState>Share your location or pick a place to see what&apos;s near.</EmptyState>}
        {spot && load.status === "loading" && <div className="skeleton h-48 rounded-sm" aria-label="Loading picks" />}
        {load.status === "error" && <p className="font-mono text-[12px] text-danger">{load.message}</p>}
        {spot && load.status === "ready" && (load.recs.length ? <RecList recs={load.recs} onAdd={null} /> : <EmptyState>{EMPTY[filter]}</EmptyState>)}
        {load.status === "ready" && load.recs.length > 0 && !load.reasons && (
          <p className="mt-4 text-[13px] text-mute">
            Scores come from your history.{" "}
            <Link href="/account" className="text-accent underline underline-offset-[3px]">
              Connect ChatGPT or Grok
            </Link>{" "}
            to get a reason with each pick.
          </p>
        )}
      </SectionRule>
      <TastePanel />
    </>
  );
}
