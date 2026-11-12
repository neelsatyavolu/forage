"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Progress } from "@/lib/types";

/** A guest has a session but no email or password yet. */
export type Account = { email: string | null; guest: boolean; createdAt: number };
export type AccountState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: Account; progress: Progress };

/** Fired after sign-in, sign-up, sign-out or a guest's first write, so every useAccount re-asks. */
export const ACCOUNT_EVENT = "forage-account";
export const accountChanged = () => window.dispatchEvent(new Event(ACCOUNT_EVENT));

/** Who is here, from GET /api/account: nobody, a guest, or an account. `refresh` re-asks. */
export function useAccount(): { state: AccountState; refresh: () => Promise<void> } {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const refresh = useCallback(async () => {
    try {
      const a = await api<{ user: null } | { user: Account; progress: Progress }>("/api/account");
      setState(a.user ? { status: "signed-in", user: a.user, progress: a.progress } : { status: "signed-out" });
    } catch {
      setState({ status: "signed-out" });
    }
  }, []);
  useEffect(() => {
    // Fetch on mount; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const again = () => void refresh();
    window.addEventListener(ACCOUNT_EVENT, again);
    return () => window.removeEventListener(ACCOUNT_EVENT, again);
  }, [refresh]);
  return { state, refresh };
}
