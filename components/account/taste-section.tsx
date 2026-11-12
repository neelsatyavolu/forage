"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/client";
import type { TasteView } from "@/lib/taste/view";
import { Button, SectionRule, Spinner } from "../ui";

type Refreshed = TasteView & { aiConnected: boolean };

const words = (tags: [string, number][]) => tags.map(([t]) => t.slice(t.indexOf(":") + 1).replace(/_/g, " ")).join(", ");

/** The taste summary, which the user can rewrite, and the tags it leans on. */
export function TasteSection() {
  const [view, setView] = useState<TasteView | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<"refresh" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TasteView>("/api/taste")
      .then(setView)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your taste."));
  }, []);

  const run = async (kind: "refresh" | "save", fn: () => Promise<TasteView>, done?: (v: TasteView) => string | null) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const v = await fn();
      setView(v);
      setDraft(null);
      setMessage(done?.(v) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const refresh = () =>
    run("refresh", () => post<Refreshed>("/api/taste/refresh", {}), (v) =>
      !(v as Refreshed).aiConnected ? "Updated from your places. Connect ChatGPT or Grok below for a written summary." : v.summaryEdited ? "Updated. Your own summary was kept." : null,
    );
  const save = (summary: string | null) => run("save", () => api<TasteView>("/api/taste", { method: "PUT", body: JSON.stringify({ summary }) }));

  return (
    <SectionRule label="Your taste" meta={view?.summaryEdited ? "Written by you" : view?.summary ? "Written by AI" : undefined}>
      {view === null && !error && <div className="skeleton h-20 max-w-[60ch] rounded-sm" aria-label="Loading" />}
      {view && draft === null && (
        <p className="max-w-[60ch] font-serif text-[18px] leading-[1.6] text-body">{view.summary || "No summary yet. Rate a few places, then update it."}</p>
      )}
      {draft !== null && (
        <textarea
          className="min-h-28 w-full max-w-[60ch] rounded-sm border border-field bg-card p-3 font-serif text-[17px] leading-[1.6] text-ink outline-none"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Your taste summary"
        />
      )}
      {view && (view.likes.length > 0 || view.dislikes.length > 0) && (
        <dl className="mt-6 grid max-w-[60ch] grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
          <dt className="font-mono text-[12px] text-mute">Likes</dt>
          <dd className="text-body">{words(view.likes) || "Nothing yet"}</dd>
          <dt className="font-mono text-[12px] text-mute">Dislikes</dt>
          <dd className="text-body">{words(view.dislikes) || "Nothing yet"}</dd>
        </dl>
      )}
      {view && (
        <div className="mt-6 flex flex-wrap gap-2">
          {draft === null ? (
            <>
              <Button size="sm" onClick={refresh} disabled={busy !== null}>
                {busy === "refresh" && <Spinner />}
                Update from my places
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setDraft(view.summary)}>
                Edit summary
              </Button>
              {view.summaryEdited && (
                <Button size="sm" variant="quiet" onClick={() => save(null)} disabled={busy !== null}>
                  Let AI write it
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => save(draft)} disabled={busy !== null}>
                {busy === "save" && <Spinner />}
                Save summary
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      {message && <p className="mt-2 font-mono text-[12px] text-mute">{message}</p>}
      {error && <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>}
    </SectionRule>
  );
}
