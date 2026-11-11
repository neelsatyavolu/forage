"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

// 56px top bar: wordmark, tabs, theme toggle. Under 900px the tabs scroll
// sideways on the same row and the toggle stays outside the scroller.

export const TABS = [
  { href: "/", label: "Near me" },
  { href: "/explore", label: "Explore" },
  { href: "/lists", label: "Lists" },
  { href: "/log", label: "Log" },
  { href: "/ask", label: "Ask" },
  { href: "/account", label: "Account" },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-full max-w-[1120px] items-center gap-6 px-6 max-[720px]:gap-3 max-[720px]:px-4">
        <Link href="/" className="shrink-0 font-serif text-[21px] font-medium text-ink">
          Forage
        </Link>
        <nav aria-label="Main" className="-my-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center rounded-sm px-3 text-[14px] font-medium pointer-coarse:h-11 ${
                  active ? "text-ink underline decoration-accent decoration-2 underline-offset-[10px]" : "text-mute hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
