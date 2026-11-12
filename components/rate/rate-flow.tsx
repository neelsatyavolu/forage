"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { accountChanged } from "@/components/account/use-account";
import { nearLabel, useLocation } from "@/components/recs/use-location";
import { Button, Spinner } from "@/components/ui";
import { dismissCookie } from "@/lib/rate/entry";
import { OCCASIONS } from "@/lib/types";
import { ComparePair } from "./compare-pair";
import { Finish } from "./finish";
import { bestFirst, ratingFromKey, unratedCount } from "./flow";
import { KeysHelp } from "./keys-help";
import { PickGrid } from "./pick-grid";
import { ProgressText } from "./progress";
import { RateCard } from "./rate-card";
import { SavePanel } from "./save-panel";
import { undoLabel } from "./undo";
import { useDeck } from "./use-deck";
import { useRateFlow, type RateFlowModel } from "./use-rate-flow";
import { useRateKeys } from "./use-rate-keys";
import { WhereStep } from "./where-step";

/**
 * Rate places near you: (A) tap every nearby place you've been to, (B) one
 * tap each for how it was, (C) at most a question or two each. Everything
 * saves as it happens, so Close never loses anything; Undo reverses the last write.
 */
export function RateFlow() {
  const router = useRouter();
  const loc = useLocation({ prompt: false });
  const [changing, setChanging] = useState(false);
  const spot = loc.state.status === "ready" && !changing ? loc.state.spot : null;
  const deck = useDeck(spot);
  const f = useRateFlow();
  const [occasionOpen, setOccasionOpen] = useState(false);
  const [saveHidden, setSaveHidden] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const leave = (to: string) => {
    document.cookie = dismissCookie();
    accountChanged();
    router.push(to);
  };
  const onSaved = (message: string) => {
    setSaved(message);
    void f.refreshAccount();
  };

  useRateKeys((e) => handleKey(e, f, { leave, occasionOpen, setOccasionOpen, searchRef }));

  const pending = unratedCount(f.queue, f.rated);
  const guest = f.who.kind === "guest";
  const showSave = guest && !saveHidden && !saved && (f.progress?.rated ?? 0) >= 5;
  const where = spot === null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-full max-w-[1120px] items-center justify-between gap-4 px-6 max-[720px]:px-4">
          <Button variant="quiet" size="sm" className="-ml-3" onClick={() => leave("/")}>
            Close
          </Button>
          {f.step === "rate" || f.step === "compare" ? (
            <span className="font-mono text-[12px] text-mute tabular-nums">
              Place {f.index + 1} of {f.queue.length}
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            {f.step !== "pick" && <ProgressText progress={f.progress} short />}
            <Button variant="quiet" size="sm" className="-mr-3" onClick={f.undoLast} disabled={f.undo.length === 0 || f.busy} title={f.undo.length ? undoLabel(f.undo[f.undo.length - 1]) : "Nothing to undo"}>
              Undo
            </Button>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-6 pt-12 pb-32 max-[720px]:px-4 max-[720px]:pt-8">
        {f.error && <p className="mb-6 font-mono text-[12px] text-danger" role="alert">{f.error}</p>}
        {where && f.step === "pick" ? (
          <WhereStep
            state={loc.state}
            notice={loc.notice}
            searchFirst={changing}
            onLocate={() => {
              setChanging(false);
              loc.locate();
            }}
            onChoose={(s) => {
              setChanging(false);
              loc.choose(s);
            }}
          />
        ) : f.step === "pick" && spot ? (
          <PickGrid spot={spot} deck={deck} queue={f.queue} marks={f.marks} rated={f.rated} busy={f.busy} searchRef={searchRef} onChangeSpot={() => setChanging(true)} onBeen={f.toggleBeen} onMark={f.mark} />
        ) : f.step === "rate" && f.current ? (
          <div className="max-w-[720px] space-y-12">
            <RateCard
              place={f.current.place}
              kind={f.current.kind}
              distanceKm={f.current.distanceKm}
              occasion={f.currentRated?.occasion ?? f.current.occasion}
              state={f.currentRated ?? null}
              busy={f.busy}
              occasionOpen={occasionOpen}
              onOccasionOpen={setOccasionOpen}
              onReact={f.react}
              onOccasion={f.setOccasion}
              onDetails={f.saveDetails}
            />
            {f.notice && <p className="font-mono text-[12px] text-mute">{f.notice}</p>}
            {showSave && <SavePanel onSaved={onSaved} onNotNow={() => setSaveHidden(true)} />}
            {saved && <p className="text-[15px] text-ok">{saved}</p>}
          </div>
        ) : f.step === "compare" && f.current && f.currentRated?.opponent ? (
          <div className="max-w-[720px]">
            <ComparePair subject={f.current.place} opponent={f.currentRated.opponent} occasion={f.currentRated.occasion} busy={f.busy} notice={f.notice} onPick={f.choose} onTooTough={f.tooTough} />
          </div>
        ) : (
          <div className="max-w-[720px] space-y-12">
            <Finish list={bestFirst(f.queue, f.rated)} progress={f.progress} place={spot ? nearLabel(spot) : "you"} onPicks={() => leave("/")} onMore={() => f.setStep("pick")} />
            {guest && !saved && <SavePanel lede="Save your places to keep them on any device." onSaved={onSaved} />}
            {saved && <p className="text-[15px] text-ok">{saved}</p>}
          </div>
        )}
        <div className="mt-16 max-w-[720px] max-[720px]:hidden">
          <button type="button" onClick={() => setKeys(!keys)} aria-expanded={keys} className="mb-3 cursor-pointer font-mono text-[12px] text-mute hover:text-ink">
            Keys
          </button>
          {keys && <KeysHelp />}
        </div>
      </main>

      <BottomBar f={f} pending={pending} where={where} />
    </div>
  );
}

function BottomBar({ f, pending, where }: { f: RateFlowModel; pending: number; where: boolean }) {
  if (where && f.step === "pick") return null;
  if (f.step === "finish" || f.step === "compare") {
    return f.step === "compare" ? (
      <Bar>
        <Button variant="quiet" onClick={f.back}>
          Back
        </Button>
      </Bar>
    ) : null;
  }
  if (f.step === "pick") {
    const touched = Object.keys(f.marks).length + Object.keys(f.rated).length > 0;
    return (
      <Bar>
        <ProgressText progress={f.progress} className="max-[560px]:hidden" />
        <span className="ml-auto flex items-center gap-2">
          {pending === 0 && touched && (
            <Button variant="quiet" onClick={() => f.setStep("finish")}>
              Done for now
            </Button>
          )}
          <Button variant={pending === 0 ? "ghost" : "accent"} onClick={f.start} disabled={pending === 0}>
            {pending === 0 ? "Pick places you've been" : `Next: rate ${pending} ${pending === 1 ? "place" : "places"}`}
          </Button>
        </span>
      </Bar>
    );
  }
  const rated = Boolean(f.currentRated);
  return (
    <Bar>
      <Button variant="quiet" onClick={f.back} disabled={f.busy}>
        Back
      </Button>
      <span className="ml-auto flex items-center gap-2">
        {!rated && (
          <Button variant="quiet" onClick={() => f.instead("skip")} disabled={f.busy}>
            Not been
          </Button>
        )}
        <Button variant={rated ? "accent" : "ghost"} onClick={f.next} disabled={f.busy}>
          {f.busy && <Spinner />}
          {rated ? "Next place" : "Skip"}
        </Button>
      </span>
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-6 max-[720px]:px-4">{children}</div>
    </div>
  );
}

type KeyCtx = {
  leave: (to: string) => void;
  occasionOpen: boolean;
  setOccasionOpen: (b: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

/** The flow's shortcuts (spec 1.2, Keyboard). Returns true when the key was used. */
function handleKey(e: KeyboardEvent, f: RateFlowModel, ctx: KeyCtx): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = e.metaKey || e.ctrlKey;
  if ((mod && key === "z") || (!mod && key === "u")) return void f.undoLast(), true;
  if (mod) return false;
  if (key === "Escape") return ctx.leave("/"), true;
  if (f.busy) return false;
  switch (f.step) {
    case "pick":
      if (key === "n" && unratedCount(f.queue, f.rated) > 0) return f.start(), true;
      if (key === "/" && ctx.searchRef.current) return ctx.searchRef.current.focus(), true;
      return false;
    case "rate": {
      if (ctx.occasionOpen && /^[1-4]$/.test(key)) {
        f.setOccasion(OCCASIONS[Number(key) - 1]);
        ctx.setOccasionOpen(false);
        return true;
      }
      const r = ratingFromKey(key);
      if (r) return void f.react(r.reaction, r.rating), true;
      const band = { l: "loved", f: "fine", d: "disliked" } as const;
      if (key in band) return void f.react(band[key as keyof typeof band], null), true;
      if (key === "o") return ctx.setOccasionOpen(!ctx.occasionOpen), true;
      if (key === "w" || key === "s") return void f.instead(key === "w" ? "want" : "skip"), true;
      if (key === "Enter" && !(e.target instanceof HTMLButtonElement)) return void f.next(), true;
      return false;
    }
    case "compare": {
      const opp = f.currentRated?.opponent;
      if (!f.current || !opp || f.notice) return false;
      if (key === "ArrowLeft") return void f.choose(f.current.place), true;
      if (key === "ArrowRight") return void f.choose(opp), true;
      if (key === "ArrowDown" || key === "t") return f.tooTough(), true;
      return false;
    }
    default:
      return false;
  }
}
