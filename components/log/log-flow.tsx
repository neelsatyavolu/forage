"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LogResponse, PlaceResponse } from "@/components/lists/types";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";
import { OCCASION_LABEL, type Place } from "@/lib/types";
import { CompareStep } from "./compare-step";
import { PlaceSearch } from "./place-search";
import { VisitForm } from "./visit-form";

type Stage = { kind: "pick" } | { kind: "form"; place: Place } | { kind: "compare"; place: Place; logged: LogResponse } | { kind: "done"; place: Place; logged: LogResponse; score: number | null };

/** Pick a place, describe the visit, answer up to two comparisons, then a short summary. */
export function LogFlow({ initialPlaceId }: { initialPlaceId?: string }) {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPlaceId) return;
    let alive = true;
    api<PlaceResponse>(`/api/places/${initialPlaceId}`)
      .then(({ place }) => alive && setStage({ kind: "form", place }))
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : "That place didn't load."));
    return () => {
      alive = false;
    };
  }, [initialPlaceId]);

  const logged = (place: Place, r: LogResponse) => setStage(r.opponent ? { kind: "compare", place, logged: r } : { kind: "done", place, logged: r, score: r.score });

  switch (stage.kind) {
    case "pick":
      return (
        <div className="space-y-6">
          {loadError && <p className="font-mono text-[12px] text-danger">{loadError}</p>}
          <PlaceSearch onPick={(place) => setStage({ kind: "form", place })} />
        </div>
      );
    case "form":
      return <VisitForm place={stage.place} onLogged={(r) => logged(stage.place, r)} onChangePlace={() => setStage({ kind: "pick" })} />;
    case "compare":
      return (
        <CompareStep
          subject={stage.place}
          occasion={stage.logged.visit.occasion}
          step={stage.logged}
          onDone={(score) => setStage({ kind: "done", place: stage.place, logged: stage.logged, score: score ?? stage.logged.score })}
        />
      );
    case "done":
      return (
        <section className="space-y-6">
          <div className="flex items-baseline justify-between gap-4 border-t border-hairline-strong pt-3 font-mono text-[12px]">
            <h2 className="text-ink">Saved</h2>
            <span className="text-mute">{OCCASION_LABEL[stage.logged.visit.occasion]}</span>
          </div>
          <div className="flex items-end justify-between gap-6">
            <p className="font-serif text-[24px] leading-[1.3] text-ink">{stage.place.name}</p>
            {stage.score !== null && (
              <p className="text-right">
                <span className="block font-mono text-[12px] text-mute">Score</span>
                <span className="font-mono text-[32px] leading-none tabular-nums">{stage.score.toFixed(1)}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setStage({ kind: "pick" })}>
              Log another
            </Button>
            <Link href="/lists" className="inline-flex h-9 items-center rounded-sm px-4 text-[14px] font-medium text-mute hover:text-ink pointer-coarse:min-h-11">
              See your lists
            </Link>
          </div>
        </section>
      );
  }
}
