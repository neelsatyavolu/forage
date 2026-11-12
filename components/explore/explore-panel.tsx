"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/use-account";
import { RecRows } from "@/components/recs/rec-rows";
import { ButtonLink, EmptyState, SectionRule } from "@/components/ui";
import { api, post } from "@/lib/client";
import { RATE_GOAL, type Rec } from "@/lib/types";
import { AddToTrip } from "./add-to-trip";
import { ModePicker } from "./mode-picker";
import { PlacePicker, rememberArea } from "./place-picker";
import { dateSpan, type Area, type ExploreMode, type Spot, type TripSummary } from "./types";
import { useTrips } from "./use-trips";

type Results = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; recs: Rec[] };

/** Explore: an area (or a Lodestar trip) and a mode side by side, then picks; a pick can go on a trip day. */
export function ExplorePanel() {
  const { state } = useAccount();
  if (state.status === "loading") return <div className="skeleton h-40 rounded-sm" aria-label="Loading" />;
  if (state.status === "signed-out")
    return (
      <EmptyState action={<ButtonLink href="/rate">Rate places</ButtonLink>}>Rate a few places you&apos;ve been, then get picks anywhere you&apos;re going.</EmptyState>
    );
  return <Explore rough={state.progress.rated < RATE_GOAL} />;
}

function Explore({ rough }: { rough: boolean }) {
  const trips = useTrips();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [mode, setMode] = useState<ExploreMode>("travel");
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [pickError, setPickError] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [adding, setAdding] = useState<Rec | null>(null);

  useEffect(() => {
    if (!spot) return;
    const ctl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResults({ status: "loading" });
    post<{ recs: Rec[] }>("/api/explore/recs", { lat: spot.lat, lng: spot.lng, radiusKm: spot.radiusKm, mode }, ctl.signal)
      .then(({ recs }) => setResults({ status: "ready", recs }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults({ status: "error", message: err instanceof Error ? err.message : "Couldn't get picks." });
      });
    return () => ctl.abort();
  }, [spot, mode]);

  const pickArea = (a: Area) => {
    setPickError(null);
    rememberArea(a);
    setSpot({ ...a, trip: null });
  };

  // A trip gives a destination name; find where that is.
  const pickTrip = async (t: TripSummary) => {
    if (!t.destination) return;
    setPickError(null);
    setBusyTrip(t.id);
    try {
      const { areas } = await api<{ areas: Area[] }>(`/api/explore/geocode?q=${encodeURIComponent(t.destination)}`);
      if (areas[0]) setSpot({ ...areas[0], trip: t });
      else setPickError(`Couldn't find ${t.destination} on the map. Search for it instead.`);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Couldn't find that trip's destination.");
    } finally {
      setBusyTrip(null);
    }
  };

  const linkedTrips = trips.status === "ready" ? trips.trips : [];
  const tripDates = spot?.trip ? dateSpan(spot.trip.startDate, spot.trip.endDate) : null;

  return (
    <>
      <div className="grid items-start gap-8 min-[900px]:grid-cols-[7fr_5fr]">
        {spot ? (
          <div>
            <span className="mb-2 block font-mono text-[12px] text-mute">Where</span>
            <p className="font-serif text-[24px] leading-[1.25]">{spot.trip ? spot.trip.title : spot.name}</p>
            <p className="mt-1 text-[14px] text-mute">
              {spot.label}
              {tripDates && <span className="ml-2 font-mono text-[12px] tnum">{tripDates}</span>}
            </p>
            <button type="button" onClick={() => setSpot(null)} className="mt-2 cursor-pointer text-[14px] text-accent hover:underline pointer-coarse:min-h-11">
              Change
            </button>
          </div>
        ) : (
          <PlacePicker trips={trips} onArea={pickArea} onTrip={pickTrip} busyTrip={busyTrip} />
        )}
        <ModePicker mode={mode} onChange={setMode} />
      </div>
      {pickError && <p className="font-mono text-[12px] text-danger">{pickError}</p>}

      {spot && (
        <SectionRule label="Picks" meta={results.status === "ready" ? `${results.recs.length} places` : undefined}>
          {results.status === "loading" && (
            <div className="space-y-3" aria-label="Loading picks">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-20 rounded-sm" />
              ))}
            </div>
          )}
          {results.status === "error" && <p className="font-mono text-[12px] text-danger">{results.message}</p>}
          {results.status === "ready" &&
            (results.recs.length ? (
              <RecRows key={`${spot.lat}:${spot.lng}:${mode}`} recs={results.recs} source="rec" rough={rough} onAddToTrip={linkedTrips.length ? setAdding : undefined} />
            ) : (
              <EmptyState>No restaurants found around here yet. Try a wider area or another mode.</EmptyState>
            ))}
        </SectionRule>
      )}

      {adding && <AddToTrip place={adding.place} trips={linkedTrips} initialTripId={spot?.trip?.id ?? null} onClose={() => setAdding(null)} />}
    </>
  );
}
