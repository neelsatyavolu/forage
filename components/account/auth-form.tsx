"use client";

import { useState } from "react";
import { post } from "@/lib/client";
import { Button, Field, inputClass } from "../ui";

type Mode = "signin" | "register" | "forgot";
const TITLE: Record<Mode, string> = { signin: "Sign in", register: "Create an account", forgot: "Reset your password" };
const SUBMIT: Record<Mode, string> = { signin: "Sign in", register: "Create account", forgot: "Email me a reset link" };

/** Sign in, sign up and forgot-password on one form. Calls onSignedIn after a sign-in or sign-up. */
export function AuthForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        const { message } = await post<{ message: string }>("/api/account/forgot", { email });
        setNotice(message);
        return;
      }
      await post(`/api/account/${mode === "register" ? "register" : "login"}`, { email, password });
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-6" aria-describedby={error ? "auth-error" : undefined}>
      <h2 className="font-serif text-[24px] leading-[1.25]">{TITLE[mode]}</h2>
      {mode === "register" && <p className="text-body">An account keeps your visits, lists and taste profile, on any device.</p>}
      <Field label="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      {mode !== "forgot" && (
        <Field label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : 1}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {error && <p id="auth-error" className="font-mono text-[12px] text-danger">{error}</p>}
      {notice && <p className="text-body">{notice}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? "One moment…" : SUBMIT[mode]}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-[14px]">
        {mode === "signin" ? (
          <>
            <button type="button" className="cursor-pointer text-accent underline-offset-[3px] hover:underline" onClick={() => switchTo("register")}>
              Create an account
            </button>
            <button type="button" className="cursor-pointer text-mute hover:text-ink" onClick={() => switchTo("forgot")}>
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" className="cursor-pointer text-accent underline-offset-[3px] hover:underline" onClick={() => switchTo("signin")}>
            {mode === "register" ? "Have an account? Sign in" : "Back to sign in"}
          </button>
        )}
      </div>
    </form>
  );
}
