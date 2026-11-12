const ROWS: [string, string][] = [
  ["Places", "Arrows move · Space or Enter: Been · W: Want to try · S: Not been · N: next · /: search"],
  ["How was it", "1–9, 0 (10): rate in one press · L, F, D: Loved, Fine, Didn't like · O then 1–4: occasion · W, S: Want to try, Not been · Enter: next"],
  ["Which more", "←: left · →: right · ↓ or T: too tough"],
  ["Anywhere", "U or Cmd/Ctrl+Z: undo · Esc: close (everything is saved)"],
];

export function KeysHelp() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-hairline pt-3 text-[13px]">
      {ROWS.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-[12px] text-mute">{k}</dt>
          <dd className="text-body">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
