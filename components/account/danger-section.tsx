"use client";

import { useState } from "react";
import { del, post } from "@/lib/client";
import { Button, Field, inputClass, SectionRule } from "../ui";

/** Sign out, sign out everywhere, and delete the account. */
export function SessionSection({ onSignedOut }: { onSignedOut: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
  };

  return (
    <SectionRule label="Sessions">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(async () => { await post("/api/account/logout", {}); onSignedOut(); })}>Sign out</Button>
        <Button variant="quiet" onClick={() => run(async () => { await post("/api/account", { action: "signout-everywhere" }); setNotice("Every other device is signed out."); })}>
          Sign out everywhere else
        </Button>
      </div>
      {notice && <p className="mt-2 text-body">{notice}</p>}
      {error && <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>}
    </SectionRule>
  );
}

export function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await del("/api/account", { password });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionRule label="Delete account">
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <p className="text-body">Deletes your account, visits, lists, taste profile, AI connections and Lodestar link. This can&apos;t be undone.</p>
        <Field label="Password" error={error} id="delete-password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "delete-password-error" : undefined}
            className={inputClass}
          />
        </Field>
        <Button type="submit" variant="danger" disabled={busy || !password}>
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </SectionRule>
  );
}

/** A guest's delete: no password to check, so a second tap confirms. */
export function GuestDeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await del("/api/account", {});
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setBusy(false);
    }
  };
  return (
    <SectionRule label="Delete these places">
      <p className="max-w-[60ch] text-body">Deletes every place you rated or saved on this browser. This can&apos;t be undone.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {confirm ? (
          <>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete them"}
            </Button>
            <Button variant="quiet" onClick={() => setConfirm(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete these places
          </Button>
        )}
      </div>
      {error && <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>}
    </SectionRule>
  );
}
