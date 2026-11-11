"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Feedback = { predicted: number; actual: number; at: number };

/**
 * "We predicted 8.4, you gave 7.1." for a place that was recommended before
 * the user logged it. Renders nothing otherwise. For visit rows and place views.
 */
export function PredictionNote({ placeId, className = "" }: { placeId: string; className?: string }) {
  const [fb, setFb] = useState<Feedback | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    api<{ feedback: Feedback | null }>(`/api/feedback?placeId=${encodeURIComponent(placeId)}`, { signal: ctl.signal })
      .then((r) => setFb(r.feedback))
      .catch(() => setFb(null));
    return () => ctl.abort();
  }, [placeId]);

  if (!fb) return null;
  return (
    <p className={`font-mono text-[12px] text-mute ${className}`}>
      We predicted <span className="text-ink tnum">{fb.predicted.toFixed(1)}</span>, you gave <span className="text-ink tnum">{fb.actual.toFixed(1)}</span>
    </p>
  );
}
