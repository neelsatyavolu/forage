"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/dialog";
import { PredictionNote } from "@/components/recs/prediction-note";
import { Button, Spinner } from "@/components/ui";
import { api, del, post } from "@/lib/client";
import { OCCASION_LABEL } from "@/lib/types";
import { placeLine } from "./been";
import type { PlaceResponse } from "./types";

const REACTION = { loved: "Loved", fine: "Fine", disliked: "Didn't like" } as const;

/** One place: your scores and visits, live Google details when available, and list actions. */
export function PlaceDialog({ placeId, onClose, onChanged }: { placeId: string | null; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<PlaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId) return;
    let alive = true;
    // Clear the previous place while the next one loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);
    api<PlaceResponse>(`/api/places/${placeId}`)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "That place didn't load."));
    return () => {
      alive = false;
    };
  }, [placeId]);

  const run = async (what: string, fn: () => Promise<unknown>, after: (d: PlaceResponse) => PlaceResponse) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      setData((d) => (d ? after(d) : d));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const toggleWant = () =>
    data &&
    run(
      "want",
      () => (data.wanted ? del("/api/want", { placeId: data.place.id }) : post("/api/want", { placeId: data.place.id })),
      (d) => ({ ...d, wanted: !d.wanted }),
    );
  const removeVisit = (id: string) => run(id, () => del(`/api/visits/${id}`), (d) => ({ ...d, visits: d.visits.filter((v) => v.id !== id) }));

  const live = data?.live;
  return (
    <Dialog open={placeId !== null} onClose={onClose} title={data?.place.name ?? "Place"}>
      <div className="space-y-8 px-6 py-6">
        {!data && !error && <div className="h-24 animate-pulse rounded-sm bg-hover" />}
        {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
        {data && (
          <>
            <p className="text-[14px] text-mute">{placeLine(data.place)}</p>
            {data.scores.length > 0 && (
              <dl className="flex flex-wrap gap-8">
                {data.scores.map((s) => (
                  <div key={s.occasion}>
                    <dt className="font-mono text-[12px] text-mute">{OCCASION_LABEL[s.occasion]}</dt>
                    <dd className="font-mono text-[28px] leading-tight tabular-nums">{s.score.toFixed(1)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {live && (
              <section className="space-y-2 border-t border-hairline-strong pt-3">
                <h3 className="font-mono text-[12px] text-ink">From Google</h3>
                <p className="font-mono text-[13px] text-body">
                  {[live.rating !== null ? `${live.rating.toFixed(1)} (${live.ratingCount ?? 0})` : null, live.priceLevel ? "$".repeat(live.priceLevel) : null, live.openNow === null ? null : live.openNow ? "Open now" : "Closed now"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {live.summary && <p className="font-serif text-[16px] text-body">{live.summary}</p>}
                {live.mapsUrl && (
                  <a href={live.mapsUrl} target="_blank" rel="noreferrer" className="text-[14px] text-accent underline underline-offset-3">
                    Open in Google Maps
                  </a>
                )}
              </section>
            )}
            {data.liveError && <p className="font-mono text-[12px] text-mute">{data.liveError}</p>}
            <section className="border-t border-hairline-strong pt-3">
              <h3 className="font-mono text-[12px] text-ink">Your visits</h3>
              {data.visits.length > 0 && <PredictionNote placeId={data.place.id} className="mt-2" />}
              {data.visits.length === 0 ? (
                <p className="mt-4 font-serif text-[16px] text-body">Not logged yet.</p>
              ) : (
                <ul className="mt-4 border-t border-hairline">
                  {data.visits.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-4 border-b border-hairline py-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-mono text-[12px] text-mute">
                          {v.visitedOn} · {OCCASION_LABEL[v.occasion]} · {REACTION[v.reaction]}
                        </p>
                        {v.dishes.length > 0 && <p className="text-[14px] text-body">{v.dishes.join(", ")}</p>}
                        {v.note && <p className="font-serif text-[16px] text-body">{v.note}</p>}
                      </div>
                      <Button size="sm" variant="quiet" onClick={() => removeVisit(v.id)} disabled={busy !== null} aria-label={`Delete visit on ${v.visitedOn}`}>
                        {busy === v.id && <Spinner />}
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex flex-wrap gap-2">
              <Link href={`/log?place=${data.place.id}`} className="inline-flex h-9 items-center rounded-sm bg-primary px-4 text-[14px] font-medium text-primary-on hover:bg-primary-hover pointer-coarse:min-h-11">
                Log a visit
              </Link>
              <Button onClick={toggleWant} disabled={busy !== null}>
                {busy === "want" && <Spinner />}
                {data.wanted ? "Remove from want to try" : "Add to want to try"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
