"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/components/account/use-account";
import { useRateSheet } from "@/components/rate/rate-sheet";
import { Button } from "@/components/ui";
import { hidesNav, isActive, TABS, YOU, youLabel } from "./tabs";

const tabClass = (active: boolean) =>
  `inline-flex h-9 shrink-0 items-center rounded-sm px-3 text-[14px] font-medium pointer-coarse:h-11 ${active ? "text-ink underline decoration-accent decoration-2 underline-offset-[10px]" : "text-mute hover:text-ink"}`;

/**
 * 56px top bar. Desktop: wordmark, the three tabs, then + Rate and You on the
 * right. Under 720px the tabs move to the bottom bar (tab-bar.tsx) and only
 * the wordmark and + Rate stay here.
 */
export function TopBar() {
  const pathname = usePathname();
  const { state } = useAccount();
  const sheet = useRateSheet();
  if (hidesNav(pathname)) return null;
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-full max-w-[1120px] items-center gap-6 px-6 max-[720px]:px-4">
        <Link href="/" className="shrink-0 font-serif text-[21px] font-medium text-ink">
          Forage
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1 max-[720px]:hidden">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => sheet.open()}>
            <Plus size={14} aria-hidden />
            Rate
          </Button>
          <Link href={YOU.href} aria-current={isActive(pathname, YOU.href) ? "page" : undefined} className={`${tabClass(isActive(pathname, YOU.href))} max-[720px]:hidden`}>
            {state.status === "loading" ? YOU.label : youLabel(state)}
          </Link>
        </div>
      </div>
    </header>
  );
}
