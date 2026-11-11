"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native modal dialog. The header and optional footer stay put; only the
 * body scrolls. Escape and the close button call onClose.
 */
export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className="m-auto overflow-hidden rounded-md border border-hairline-strong bg-card p-0 text-ink backdrop:bg-scrim"
    >
      <div className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-hairline px-6 py-4">
          <h2 className="text-[16px] font-medium">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 cursor-pointer items-center justify-center text-mute hover:text-ink pointer-coarse:size-11">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{open && children}</div>
        {open && footer && <div className="shrink-0 border-t border-hairline px-6 py-4">{footer}</div>}
      </div>
    </dialog>
  );
}
