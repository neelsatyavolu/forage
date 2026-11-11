"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { RecList } from "@/components/explore/rec-list";
import { api, ApiError, post } from "@/lib/client";
import type { Rec } from "@/lib/types";
import { useAccount } from "../account/use-account";
import { Button, EmptyState, Field, SectionRule, Spinner } from "../ui";
import { LocationBar } from "./location-bar";
import { useLocation } from "./use-location";

type Ai = "checking" | "connected" | "none";
type Result = { status: "idle" } | { status: "asking" } | { status: "done"; recs: Rec[] } | { status: "error"; message: string; needsAi: boolean };

const linkClass = "text-accent underline underline-offset-[3px]";

function NeedsAi() {
  return (
    <EmptyState>
      Ask runs on your own ChatGPT or Grok account, which isn&apos;t connected yet.{" "}
      <Link href="/account" className={linkClass}>
        Connect one on the Account page
      </Link>
      , then come back.
    </EmptyState>
  );
}

/** Describe tonight in words, get three picks with reasons. */
export function AskPanel() {
  const { state: account } = useAccount();
  const { state: location, notice, locate, choose } = useLocation();
  const [ai, setAi] = useState<Ai>("checking");
  const [want, setWant] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });
  const spot = location.status === "ready" ? location.spot : null;

  useEffect(() => {
    api<{ connected: { codex: boolean; grok: boolean } }>("/api/ai/status")
      .then(({ connected }) => setAi(connected.codex || connected.grok ? "connected" : "none"))
      .catch(() => setAi("none"));
  }, []);

  if (account.status === "loading" || ai === "checking") return <div className="skeleton h-40 rounded-sm" aria-label="Loading" />;
  if (account.status === "signed-out")
    return (
      <EmptyState>
        <Link href="/account" className={linkClass}>
          Sign in
        </Link>{" "}
        to ask for picks based on the places you have eaten.
      </EmptyState>
    );
  if (ai === "none") return <NeedsAi />;

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!spot) return;
    setResult({ status: "asking" });
    try {
      const { recs } = await post<{ recs: Rec[] }>("/api/recs/ask", { lat: spot.lat, lng: spot.lng, want });
      setResult({ status: "done", recs });
    } catch (err) {
      setResult({ status: "error", message: err instanceof Error ? err.message : "Ask failed. Try again.", needsAi: err instanceof ApiError && err.status === 401 });
    }
  };

  const tooShort = want.trim().length < 3;
  return (
    <>
      <LocationBar state={location} notice={notice} onLocate={locate} onChoose={choose} />
      <form onSubmit={ask} className="max-w-[60ch] space-y-4">
        <Field label="What do you want tonight">
          <textarea
            className="min-h-24 w-full rounded-sm border border-field bg-card p-3 text-[15px] text-ink outline-none placeholder:text-mute"
            value={want}
            maxLength={500}
            onChange={(e) => setWant(e.target.value)}
            placeholder="Something spicy and brothy, under $30, for two"
          />
        </Field>
        <Button type="submit" variant="accent" disabled={tooShort || !spot || result.status === "asking"}>
          {result.status === "asking" && <Spinner />}
          {result.status === "asking" ? "Picking" : "Get three picks"}
        </Button>
      </form>
      {result.status === "error" && (result.needsAi ? <NeedsAi /> : <p className="font-mono text-[12px] text-danger">{result.message}</p>)}
      {result.status === "done" && (
        <SectionRule label="Picks" meta={`${result.recs.length} of 3`}>
          <RecList recs={result.recs} onAdd={null} />
        </SectionRule>
      )}
    </>
  );
}
