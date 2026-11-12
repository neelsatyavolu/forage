"use client";

import { useSyncExternalStore } from "react";
import { Segmented } from "./segmented";

// System, light or dark. The choice lives on <html data-theme> and in
// localStorage; app/layout.tsx applies it before first paint.

type Theme = "system" | "light" | "dark";
const EVENT = "forage-theme";

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** System, Light or Dark, for the You page. */
export function ThemeChoice() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return <Segmented label="Theme" options={OPTIONS} value={theme} onChange={apply} />;
}
