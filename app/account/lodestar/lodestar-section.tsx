"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, SectionRule, Spinner } from "@/components/ui";
import { api, del, post } from "@/lib/client";

type Status = { linked: false } | { linked: true; label: string | null; connectedAt: number };

// What the callback reports in ?lodestar= when it sends the browser back here.
const OUTCOME: Record<string, { text: string; error: boolean }> = {
  connected: { text: "Lodestar is connected.", error: false },
  cancelled: { text: "Connecting was cancelled in Lodestar.", error: true },
  expired: { text: "That sign-in took too long or came from another session. Try again.", error: true },
  "signed-out": { text: "Sign in to Forage first, then connect Lodestar.", error: true },
  failed: { text: "Lodestar couldn't be connected. Try again.", error: true },
};

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Seed = { cuisines: string[]; dietary: string[]; priceCeiling: number | null };

/** "Imported 4 cuisines, vegetarian, budget $$." */
function importedText(seed: Seed): string {
  const parts = [
    `${seed.cuisines.length} ${seed.cuisines.length === 1 ? "cuisine" : "cuisines"}`,
    ...seed.dietary.map((d) => d.replace(/_/g, " ")),
    seed.priceCeiling ? `budget ${"$".repeat(seed.priceCeiling)}` : null,
  ].filter(Boolean);
  return `Imported ${parts.join(", ")}.`;
}

/** Read and clear the callback's ?lodestar= result, so a reload doesn't show it again. */
function takeOutcome(): { text: string; error: boolean } | null {
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get("lodestar");
  if (!outcome) return null;
  url.searchParams.delete("lodestar");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return OUTCOME[outcome] ?? null;
}

/** Link this account to a Lodestar account (separate logins) so Explore can read trips and add meals to them. */
export function LodestarSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/lodestar"));
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't check Lodestar.", error: true });
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(takeOutcome());
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      window.location.assign((await post<{ url: string }>("/api/lodestar/connect", {})).url);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't start connecting.", error: true });
      setBusy(false);
    }
  };

  const importPrefs = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { seed } = await post<{ seed: Seed }>("/api/lodestar/preferences", {});
      setMessage({ text: importedText(seed), error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't import preferences.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await del("/api/lodestar");
      setStatus({ linked: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't disconnect.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionRule label="Lodestar" meta={status?.linked ? `Connected ${day(status.connectedAt)}` : undefined}>
      <p className="max-w-[60ch] text-body">
        Connect your Lodestar account to explore around your trips and add restaurants to a trip day. Your liked cuisines, dietary needs and dining budget come over too, without changing what your own visits say. Your Forage and Lodestar sign-ins stay separate.
      </p>
      <div className="mt-6 flex min-h-12 items-center justify-between gap-4 border-y border-hairline py-2">
        <span className="text-[14px] font-medium">{status?.linked ? (status.label ?? "Lodestar") : "Lodestar Trips"}</span>
        {status === null ? (
          <span className="font-mono text-[12px] text-mute">Checking</span>
        ) : status.linked ? (
          <button type="button" onClick={disconnect} disabled={busy} className="cursor-pointer text-[14px] text-mute hover:text-ink disabled:text-stone pointer-coarse:min-h-11">
            Disconnect
          </button>
        ) : (
          <Button size="sm" onClick={connect} disabled={busy}>
            {busy && <Spinner />}
            Connect Lodestar
          </Button>
        )}
      </div>
      {status?.linked && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-hairline py-2">
          <span className="text-[14px]">Dining preferences</span>
          <Button size="sm" onClick={importPrefs} disabled={busy}>
            {busy && <Spinner />}
            Import from Lodestar
          </Button>
        </div>
      )}
      {status?.linked && <p className="mt-2 text-[12px] text-mute">Disconnecting removes the link here. To end it on Lodestar&apos;s side too, remove Forage in Lodestar&apos;s settings.</p>}
      {message && <p className={`mt-2 font-mono text-[12px] ${message.error ? "text-danger" : "text-ok"}`}>{message.text}</p>}
    </SectionRule>
  );
}
