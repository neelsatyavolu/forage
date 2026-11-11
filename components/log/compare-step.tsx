"use client";

import { useState } from "react";
import type { CompareStep as Step } from "@/components/lists/types";
import { Button, Spinner } from "@/components/ui";
import { post } from "@/lib/client";
import { OCCASION_LABEL, type Occasion, type Place } from "@/lib/types";
import { PlaceText } from "./place-search";

/**
 * "Which did you like more?" between the place just logged and one the
 * server picked. Answers go to /api/comparisons, which refits and returns
 * the next question or none. Skip ends the questions.
 */
export function CompareStep({ subject, occasion, step, onDone }: { subject: Place; occasion: Occasion; step: Step; onDone: (score: number | null) => void }) {
  const [current, setCurrent] = useState(step);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opponent = current.opponent;
  if (!opponent) return null;

  const answer = async (winner: Place) => {
    const loser = winner.id === subject.id ? opponent : subject;
    setBusy(winner.id);
    setError(null);
    try {
      const asked = current.asked + 1;
      const next = await post<Step>("/api/comparisons", {
        comparison: { winnerPlaceId: winner.id, loserPlaceId: loser.id, occasion },
        next: { subjectPlaceId: subject.id, asked },
      });
      if (next.opponent) setCurrent(next);
      else onDone(next.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 border-t border-hairline-strong pt-3 font-mono text-[12px]">
        <h2 className="text-ink">Which did you like more?</h2>
        <span className="text-mute">
          {OCCASION_LABEL[occasion]} · Question {current.asked + 1}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
        {[subject, opponent].map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy !== null}
            onClick={() => answer(p)}
            className="flex min-h-24 cursor-pointer items-start justify-between gap-2 rounded-sm border border-field bg-card p-4 text-left hover:bg-hover disabled:cursor-default"
          >
            <span className="min-w-0">
              <PlaceText place={p} />
            </span>
            {busy === p.id && <Spinner />}
          </button>
        ))}
      </div>
      {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
      <Button type="button" variant="quiet" onClick={() => onDone(current.score)} disabled={busy !== null}>
        Skip
      </Button>
    </section>
  );
}
