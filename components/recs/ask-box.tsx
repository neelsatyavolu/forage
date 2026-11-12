"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/client";
import type { Rec } from "@/lib/types";
import { Button, inputClass, SectionRule, Spinner } from "../ui";
import { RecRows } from "./rec-rows";
import type { Spot } from "./use-location";

type Ai = "unknown" | "checking" | "connected" | "none";
type Result = { status: "idle" } | { status: "asking" } | { status: "done"; recs: Rec[]; want: string } | { status: "error"; message: string };

/**
 * Near me's Ask: one line ("spicy, under $30, for two") and three picks with
 * reasons, above the regular list. It runs on the user's own ChatGPT or Grok;
 * without one, focusing the box says where to connect it.
 */
export function AskBox({ spot, focus }: { spot: Spot | null; focus: boolean }) {
  const [ai, setAi] = useState<Ai>("unknown");
  const [want, setWant] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });
  const input = useRef<HTMLInputElement>(null);

  const check = () => {
    if (ai !== "unknown") return;
    setAi("checking");
    api<{ connected: { codex: boolean; grok: boolean } }>("/api/ai/status")
      .then(({ connected }) => setAi(connected.codex || connected.grok ? "connected" : "none"))
      .catch(() => setAi("none"));
  };

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!spot || ai !== "connected") return;
    setResult({ status: "asking" });
    try {
      const { recs } = await post<{ recs: Rec[] }>("/api/recs/ask", { lat: spot.lat, lng: spot.lng, want });
      setResult({ status: "done", recs, want: want.trim() });
    } catch (err) {
      setResult({ status: "error", message: err instanceof Error ? err.message : "Ask failed. Try again." });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={ask} className="flex max-w-[640px] gap-2">
        <input
          ref={input}
          className={inputClass}
          value={want}
          maxLength={500}
          onFocus={check}
          onChange={(e) => setWant(e.target.value)}
          placeholder="What are you in the mood for?"
          aria-label="Ask for three picks"
        />
        <Button type="submit" disabled={ai !== "connected" || want.trim().length < 3 || !spot || result.status === "asking"}>
          {result.status === "asking" && <Spinner />}
          Ask
        </Button>
      </form>
      {ai === "none" && (
        <p className="text-[13px] text-mute">
          Ask uses your own ChatGPT or Grok.{" "}
          <Link href="/account" className="text-accent underline underline-offset-[3px]">
            Connect one in You
          </Link>
          .
        </p>
      )}
      {result.status === "error" && <p className="font-mono text-[12px] text-danger">{result.message}</p>}
      {result.status === "done" && (
        <SectionRule label={`For "${result.want}"`} meta={`${result.recs.length} of 3`}>
          <RecRows recs={result.recs} source="ask" paged={false} />
        </SectionRule>
      )}
    </div>
  );
}
