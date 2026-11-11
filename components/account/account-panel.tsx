"use client";

import { AiSection } from "./ai-section";
import { AuthForm } from "./auth-form";
import { DeleteSection, SessionSection } from "./danger-section";
import { useAccount } from "./use-account";
import { SectionRule } from "../ui";

const joined = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The Account tab. Signed out: the sign-in form. Signed in: one section per
 * concern, each its own component; new sections (the Lodestar link) slot in
 * between AI and Sessions.
 */
export function AccountPanel() {
  const { state, refresh } = useAccount();

  if (state.status === "loading") return <div className="skeleton h-40 max-w-sm rounded-sm" aria-label="Loading" />;
  if (state.status === "signed-out") return <AuthForm onSignedIn={refresh} />;

  return (
    <>
      <SectionRule label="Signed in" meta={<span className="tnum">Joined {joined(state.user.createdAt)}</span>}>
        <p className="text-[15px] text-ink">{state.user.email}</p>
      </SectionRule>
      <AiSection />
      <SessionSection onSignedOut={refresh} />
      <DeleteSection onDeleted={refresh} />
    </>
  );
}
