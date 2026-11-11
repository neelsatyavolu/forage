"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { post } from "@/lib/client";
import { Dialog } from "../dialog";
import { Button, inputClass } from "../ui";

export type Provider = "codex" | "grok";
export const PROVIDER_NAME: Record<Provider, string> = { codex: "ChatGPT", grok: "Grok" };

const HOW: Record<Provider, string> = {
  codex: "Sign in with your ChatGPT account. You'll land on a page that doesn't load (a localhost address). That's expected: copy the full address from the address bar and paste it below.",
  grok: "Sign in with your X / Grok account. Grok then shows a code. Copy it and paste it below.",
};

/** The two-step sign-in: open the provider's page, paste back the link or code. */
export function ConnectAI({ open, onClose, onConnected, provider }: { open: boolean; onClose: () => void; onConnected: () => void; provider: Provider }) {
  const [started, setStarted] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStarted(false);
    setPasted("");
    setError(null);
    onClose();
  };

  const start = async () => {
    setError(null);
    // Open the tab synchronously so popup blockers allow it, then point it at the sign-in URL.
    const tab = window.open("about:blank", "_blank");
    try {
      const { authorizeUrl } = await post<{ authorizeUrl: string }>(`/api/ai/${provider}/start`, {});
      if (tab) tab.location.href = authorizeUrl;
      else window.open(authorizeUrl, "_blank", "noopener");
      setStarted(true);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Couldn't start sign-in.");
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/ai/${provider}/complete`, { callback: pasted });
      onConnected();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="quiet" onClick={close}>
        Cancel
      </Button>
      <Button variant="primary" disabled={!started || !pasted.trim() || busy} onClick={finish}>
        {busy ? "Connecting…" : "Connect"}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onClose={close} title={`Connect ${PROVIDER_NAME[provider]}`} footer={footer}>
      <ol className="space-y-6 p-6 text-[14px]">
        <li className="space-y-2">
          <p className="font-mono text-[12px] text-mute">Step 1</p>
          <p className="text-body">{HOW[provider]}</p>
          <Button size="sm" onClick={start}>
            Open {PROVIDER_NAME[provider]} sign-in <ExternalLink size={12} aria-hidden />
          </Button>
        </li>
        <li className="space-y-2">
          <label htmlFor="ai-callback" className={`block font-mono text-[12px] ${started ? "text-mute" : "text-stone"}`}>
            Step 2: paste the {provider === "codex" ? "address" : "code"}
          </label>
          <input
            id="ai-callback"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            disabled={!started}
            placeholder={provider === "codex" ? "http://localhost:1455/auth/callback?code=…" : "Code from Grok"}
            className={`${inputClass} font-mono text-[13px] disabled:border-hairline`}
            autoComplete="off"
            spellCheck={false}
          />
        </li>
        {error && <li className="font-mono text-[12px] text-danger">{error}</li>}
      </ol>
    </Dialog>
  );
}
