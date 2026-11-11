"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { Button, Field, inputClass } from "../ui";

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="text-body">
        Your password is changed and you&apos;re signed in. Every other session was signed out.{" "}
        <Link href="/" className="text-accent underline underline-offset-[3px]">
          Go to Forage
        </Link>
      </p>
    );
  }

  return (
    <form
      className="max-w-sm space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await post("/api/account/reset", { token, password });
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "That didn't work. Try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {!token && <p className="font-mono text-[12px] text-danger">This link is missing its code. Open the link from the email again.</p>}
      <Field label="New password" hint="At least 8 characters." error={error} id="new-password">
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-password-error" : undefined}
          className={inputClass}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={busy || !token} className="w-full">
        {busy ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
