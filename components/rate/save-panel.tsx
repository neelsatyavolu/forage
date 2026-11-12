"use client";

import { useState } from "react";
import { Button, Field, inputClass, Spinner } from "@/components/ui";
import { saveAccount, signIn } from "./api";

/**
 * Turns this guest into an account (same places, nothing moves), or signs in
 * to an existing one, which adds the guest's places to it. Never a modal.
 */
export function SavePanel({ lede = "Save your places so you don't lose them.", onSaved, onNotNow }: { lede?: string; onSaved: (message: string) => void; onNotNow?: () => void }) {
  const [mode, setMode] = useState<"save" | "signin">("save");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "save") {
        await saveAccount(email, password);
        onSaved(`Saved to ${email.trim().toLowerCase()}.`);
      } else {
        const { merged } = await signIn(email, password);
        onSaved(merged && merged.visits > 0 ? `Added your ratings to ${email.trim().toLowerCase()}.` : "Signed in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-[560px] space-y-4 border-t border-hairline-strong pt-3" aria-describedby={error ? "save-error" : undefined}>
      <div className="flex items-baseline justify-between gap-4 font-mono text-[12px]">
        <h2 className="text-ink">{mode === "save" ? "Save your places" : "Sign in"}</h2>
        {onNotNow && (
          <button type="button" onClick={onNotNow} className="cursor-pointer text-mute hover:text-ink pointer-coarse:min-h-11">
            Not now
          </button>
        )}
      </div>
      <p className="text-[15px] text-body">{mode === "save" ? lede : "Your ratings here are added to your account."}</p>
      <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" hint={mode === "save" ? "At least 8 characters." : undefined}>
          <input
            type="password"
            required
            minLength={mode === "save" ? 8 : 1}
            autoComplete={mode === "save" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {error && (
        <p id="save-error" className="font-mono text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy && <Spinner />}
          {mode === "save" ? "Save" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "save" ? "signin" : "save");
            setError(null);
          }}
          className="cursor-pointer text-[14px] text-accent underline-offset-[3px] hover:underline pointer-coarse:min-h-11"
        >
          {mode === "save" ? "Already have an account? Sign in" : "New here? Save instead"}
        </button>
      </div>
    </form>
  );
}
