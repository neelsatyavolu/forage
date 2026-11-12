"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hidesNav, isActive, TABS, YOU } from "./tabs";

/** Phone only (under 720px): Near me, Explore, Lists and You along the bottom, 64px plus the safe area. */
export function TabBar() {
  const pathname = usePathname();
  if (hidesNav(pathname)) return null;
  return (
    <>
      <div className="h-[calc(64px+env(safe-area-inset-bottom))] min-[721px]:hidden" aria-hidden />
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] min-[721px]:hidden">
        <ul className="grid h-16 grid-cols-4">
          {[...TABS, YOU].map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-full flex-col items-center justify-center gap-1 text-[12px] font-medium ${active ? "text-ink" : "text-mute"}`}
                >
                  {active && <span className="absolute inset-x-6 top-0 h-0.5 bg-accent" aria-hidden />}
                  <Icon size={20} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
