"use client";

import { useEffect, useRef } from "react";

/** True while typing, when single-letter shortcuts must not fire. */
export function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Window keyboard shortcuts for the rating flow. The handler gets every
 * keydown outside text fields (and without Alt) and returns true when it used
 * the key, which then does nothing else.
 */
export function useRateKeys(handler: (e: KeyboardEvent) => boolean) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.defaultPrevented || typingIn(e.target)) return;
      if (latest.current(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
