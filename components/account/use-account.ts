"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

export type Account = { email: string; createdAt: number };
export type AccountState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: Account };

/** Who is signed in, from GET /api/account. `refresh` re-asks after sign-in or sign-out. */
export function useAccount(): { state: AccountState; refresh: () => Promise<void> } {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: Account | null }>("/api/account");
      setState(user ? { status: "signed-in", user } : { status: "signed-out" });
    } catch {
      setState({ status: "signed-out" });
    }
  }, []);
  useEffect(() => {
    // Fetch on mount; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return { state, refresh };
}
