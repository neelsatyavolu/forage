"use client";

import { LodestarSection } from "@/app/account/lodestar/lodestar-section";
import { SavePanel } from "@/components/rate/save-panel";
import { ThemeChoice } from "@/components/theme-choice";
import { AiSection } from "./ai-section";
import { AuthForm } from "./auth-form";
import { DeleteSection, GuestDeleteSection, SessionSection } from "./danger-section";
import { TasteSection } from "./taste-section";
import { accountChanged, useAccount } from "./use-account";
import { SectionRule } from "../ui";

const joined = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * You: account, taste, appearance, AI, Lodestar, sessions, delete. Nobody: sign in or create an account. A guest: save these
 * places to an account (or sign in, which adds them). An account: one section
 * per concern.
 */
export function AccountPanel() {
  const { state, refresh } = useAccount();
  const changed = () => {
    void refresh();
    accountChanged();
  };

  if (state.status === "loading") return <div className="skeleton h-40 max-w-sm rounded-sm" aria-label="Loading" />;
  if (state.status === "signed-out")
    return (
      <>
        <SectionRule label="Account">
          <AuthForm onSignedIn={changed} />
        </SectionRule>
        <Appearance />
      </>
    );

  if (state.user.guest)
    return (
      <>
        <SavePanel lede="Your places are saved on this browser for 30 days after your last visit. Save them to an account to keep them." onSaved={changed} />
        <TasteSection />
        <Appearance />
        <AiSection />
        <GuestDeleteSection onDeleted={changed} />
      </>
    );

  return (
    <>
      <SectionRule label="Account" meta={<span className="tnum">Joined {joined(state.user.createdAt)}</span>}>
        <p className="text-[15px] text-ink">{state.user.email}</p>
      </SectionRule>
      <TasteSection />
      <Appearance />
      <AiSection />
      <LodestarSection />
      <SessionSection onSignedOut={changed} />
      <DeleteSection onDeleted={changed} />
    </>
  );
}

function Appearance() {
  return (
    <SectionRule label="Appearance">
      <ThemeChoice />
    </SectionRule>
  );
}
