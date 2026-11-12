import type { ReactNode } from "react";
import { ScoreText } from "./ui";

type Props = {
  name: string;
  /** Line 2: what and where, already joined ("Cafe · $$ · 290 m · Grove St"). */
  meta: string;
  /** Line 3 in mono (a reaction and date), optional. */
  note?: ReactNode;
  score?: { value: number; muted?: boolean; title?: string } | null;
  rank?: number;
  /** One line from the AI, in serif. */
  reason?: string;
  /** Buttons and links under the text; they never open the row. */
  actions?: ReactNode;
  onOpen?: () => void;
  selected?: boolean;
};

/**
 * One place in a list: hairline bottom rule, 16px vertical padding, the score
 * at the right in mono. The text opens the place when `onOpen` is given;
 * `actions` sit beneath and stay separate buttons.
 */
export function PlaceRow({ name, meta, note, score, rank, reason, actions, onOpen, selected }: Props) {
  const body = (
    <>
      {rank !== undefined && <span className="w-6 shrink-0 pt-0.5 font-mono text-[12px] text-mute tabular-nums">{rank}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-ink">{name}</span>
        {meta && <span className="mt-0.5 block truncate text-[13px] text-mute">{meta}</span>}
        {note && <span className="mt-0.5 block font-mono text-[12px] text-mute">{note}</span>}
      </span>
      {score ? <ScoreText value={score.value} muted={score.muted} title={score.title} className="shrink-0 pt-0.5" /> : score === null ? <span className="shrink-0 font-mono text-[20px] leading-none text-mute">–</span> : null}
    </>
  );
  return (
    <li className={`border-b border-hairline ${selected ? "bg-wash" : ""}`}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-current={selected ? "true" : undefined} className="flex min-h-11 w-full cursor-pointer items-start gap-4 px-2 pt-4 pb-2 text-left hover:bg-hover">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-4 px-2 pt-4 pb-2">{body}</div>
      )}
      {reason && <p className={`max-w-[60ch] px-2 pb-2 font-serif text-[16px] leading-[1.5] text-body ${rank !== undefined ? "pl-12" : ""}`}>{reason}</p>}
      {actions ? <div className={`flex flex-wrap items-center gap-x-4 px-2 pb-3 text-[13px] ${rank !== undefined ? "pl-12" : ""}`}>{actions}</div> : <div className="pb-2" />}
    </li>
  );
}

/** A text button for a row's actions: accent, 44px on touch. */
export function RowAction({ children, onClick, pressed }: { children: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`inline-flex min-h-8 cursor-pointer items-center hover:underline pointer-coarse:min-h-11 ${pressed ? "text-mute" : "text-accent"}`}>
      {children}
    </button>
  );
}
