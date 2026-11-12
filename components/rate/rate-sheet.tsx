"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Dialog } from "@/components/dialog";
import { QuickRate } from "./quick-rate";

type Sheet = { open: (placeId?: string) => void };
const SheetContext = createContext<Sheet>({ open: () => undefined });

/** The + Rate sheet: open it from anywhere, optionally on one place. */
export const useRateSheet = () => useContext(SheetContext);

export function RateSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; placeId?: string; n: number }>({ open: false, n: 0 });
  const close = () => setState((s) => ({ ...s, open: false }));
  return (
    <SheetContext.Provider value={{ open: (placeId) => setState((s) => ({ open: true, placeId, n: s.n + 1 })) }}>
      {children}
      <Dialog open={state.open} onClose={close} title="Rate a place" width={640}>
        <div className="px-6 py-6 max-[560px]:px-4">
          <QuickRate key={state.n} initialPlaceId={state.placeId} onDone={close} />
        </div>
      </Dialog>
    </SheetContext.Provider>
  );
}
