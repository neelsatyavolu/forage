"use client";

import { useEffect, useState } from "react";
import { accountChanged } from "@/components/account/use-account";
import type { PlaceResponse } from "@/components/lists/types";
import { PlaceSearch } from "@/components/log/place-search";
import { Button, ScoreText } from "@/components/ui";
import { api } from "@/lib/client";
import { guessOccasion, placeKind } from "@/lib/rate/occasion";
import { OCCASION_LABEL, type Occasion, type Place, type Reaction, type VisitPatch } from "@/lib/types";
import * as call from "./api";
import { ComparePair } from "./compare-pair";
import { RateCard, type CardState } from "./rate-card";

/** Questions per place outside onboarding, as the server allows. */
const MAX_QUESTIONS = 2;
export const RATED_EVENT = "forage-rated";

type Saved = { visitId: string; reaction: Reaction; rating: number | null; occasion: Occasion; score: number | null; opponent: Place | null; asked: number };

/**
 * Rate one place: find it (places near you show first), tap how it was,
 * optionally fine-tune and add details, answer up to two questions, see the
 * score. Used by the + Rate sheet and the /log page.
 */
export function QuickRate({ initialPlaceId, onDone }: { initialPlaceId?: string; onDone: () => void }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [occasion, setOccasion] = useState<Occasion>("casual");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [stage, setStage] = useState<"card" | "compare" | "done">("card");
  const [occasionOpen, setOccasionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const choose = (p: Place) => {
    setPlace(p);
    setOccasion(guessOccasion(p));
    setSaved(null);
    setStage("card");
    setNotice(null);
  };

  useEffect(() => {
    if (!initialPlaceId) return;
    let alive = true;
    api<PlaceResponse>(`/api/places/${initialPlaceId}`)
      .then(({ place: p }) => alive && choose(p))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "That place didn't load."));
    return () => {
      alive = false;
    };
  }, [initialPlaceId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const edit = (fields: VisitPatch) =>
    run(async () => {
      if (!saved) return;
      const res = await call.editVisit(saved.visitId, fields);
      setSaved({ ...saved, reaction: res.visit.reaction, rating: res.visit.rating, occasion: res.visit.occasion, score: res.score, opponent: null });
    });

  const react = (reaction: Reaction, rating: number | null) =>
    run(async () => {
      if (!place) return;
      if (saved) return void (await edit({ reaction, rating }));
      const res = await call.rate(place.id, reaction, occasion, rating);
      setSaved({ visitId: res.visit.id, reaction, rating, occasion: res.visit.occasion, score: res.score, opponent: res.opponent, asked: 0 });
      window.dispatchEvent(new Event(RATED_EVENT));
      accountChanged();
    });

  const next = () =>
    run(async () => {
      if (!place || !saved) return;
      let opponent = saved.opponent;
      if (!opponent && saved.asked < MAX_QUESTIONS) opponent = (await call.nextOpponent(place.id, saved.occasion, saved.asked)).opponent;
      setSaved({ ...saved, opponent });
      setStage(opponent && saved.asked < MAX_QUESTIONS ? "compare" : "done");
    });

  const pick = (winner: Place) =>
    run(async () => {
      if (!place || !saved?.opponent) return;
      const loser = winner.id === place.id ? saved.opponent : place;
      const asked = saved.asked + 1;
      const res = await call.answer(winner.id, loser.id, saved.occasion, place.id, asked);
      const score = res.subjectScore ?? res.score;
      setSaved({ ...saved, score, asked, opponent: asked < MAX_QUESTIONS ? res.opponent : null });
      if (!(asked < MAX_QUESTIONS && res.opponent)) setStage("done");
    });

  if (!place)
    return (
      <div className="space-y-4">
        {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
        <PlaceSearch onPick={choose} />
      </div>
    );

  if (stage === "done" && saved)
    return (
      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-4 font-mono text-[12px]">
          <h2 className="text-ink">Saved</h2>
          <span className="text-mute">{OCCASION_LABEL[saved.occasion]}</span>
        </div>
        <div className="flex items-end justify-between gap-6">
          <p className="font-serif text-[24px] leading-[1.3]">{place.name}</p>
          {saved.score !== null && <ScoreText value={saved.score} size="lg" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPlace(null)}>Rate another</Button>
          <Button variant="quiet" onClick={onDone}>
            Done
          </Button>
        </div>
      </section>
    );

  if (stage === "compare" && saved?.opponent)
    return <ComparePair subject={place} opponent={saved.opponent} occasion={saved.occasion} busy={busy} notice={null} onPick={pick} onTooTough={() => setStage("done")} />;

  return (
    <div className="space-y-8">
      <RateCard
        place={place}
        kind={placeKind(place)}
        distanceKm={null}
        occasion={saved?.occasion ?? occasion}
        state={saved as CardState}
        busy={busy}
        occasionOpen={occasionOpen}
        onOccasionOpen={setOccasionOpen}
        onReact={react}
        onOccasion={(o) => (saved ? void edit({ occasion: o }) : setOccasion(o))}
        onDetails={(f) => void edit(f).then(() => setNotice("Details saved"))}
      />
      {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
      {notice && <p className="font-mono text-[12px] text-mute">{notice}</p>}
      <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
        <Button variant={saved ? "primary" : "ghost"} onClick={next} disabled={!saved || busy}>
          {saved ? "Next" : "Pick how it was"}
        </Button>
        <Button variant="quiet" onClick={() => setPlace(null)}>
          Change place
        </Button>
      </div>
    </div>
  );
}
