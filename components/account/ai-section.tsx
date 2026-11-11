"use client";

import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/client";
import { SectionRule } from "../ui";
import { ConnectAI, PROVIDER_NAME, type Provider } from "./connect-ai";

const PROVIDERS: Provider[] = ["codex", "grok"];

/** Connect or disconnect ChatGPT and Grok. Recommendations' reasons and Ask run on these. */
export function AiSection() {
  const [connected, setConnected] = useState<Record<Provider, boolean> | null>(null);
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConnected((await api<{ connected: Record<Provider, boolean> }>("/api/ai/status")).connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check your AI connections.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const disconnect = async (p: Provider) => {
    setError(null);
    try {
      await post(`/api/ai/${p}/logout`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect.");
    }
  };

  const count = connected ? PROVIDERS.filter((p) => connected[p]).length : null;
  return (
    <SectionRule label="AI" meta={count === null ? undefined : `${count} of 2 connected`}>
      <p className="max-w-[60ch] text-body">
        Reasons for each pick, Ask, and the reranking use your own ChatGPT or Grok subscription. The sign-in is encrypted and saved to your account.
      </p>
      <ul className="mt-6 border-t border-hairline">
        {PROVIDERS.map((p) => (
          <li key={p} className="flex min-h-12 items-center justify-between gap-4 border-b border-hairline py-2">
            <span className="text-[14px] font-medium">{PROVIDER_NAME[p]}</span>
            <span className="flex items-center gap-4">
              <span className="font-mono text-[12px] text-mute">{connected === null ? "Checking" : connected[p] ? "Connected" : "Not connected"}</span>
              {connected?.[p] ? (
                <button type="button" onClick={() => disconnect(p)} className="cursor-pointer text-[14px] text-mute hover:text-ink pointer-coarse:min-h-11">
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={() => setConnecting(p)} disabled={connected === null} className="cursor-pointer text-[14px] text-accent hover:underline disabled:text-stone pointer-coarse:min-h-11">
                  Connect
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 font-mono text-[12px] text-danger">{error}</p>}
      {connecting && <ConnectAI open provider={connecting} onClose={() => setConnecting(null)} onConnected={load} />}
    </SectionRule>
  );
}
