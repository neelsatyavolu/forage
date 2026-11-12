"use client";

import { useEffect, useRef, useState } from "react";
import type { Occasion, Place, Progress, Reaction, VisitPatch } from "@/lib/types";
import * as call from "./api";
import { compareLimit, nextUnrated, toggleQueue, wantsQuestion, type Candidate, type Rated } from "./flow";
import { popUndo, pushUndo, type UndoEntry } from "./undo";

export type Step = "pick" | "rate" | "compare" | "finish";
export type Mark = "want" | "skip";
/** Who is rating: nobody yet (no session), a guest, or a saved account. */
export type Who = { kind: "loading" } | { kind: "none" } | { kind: "guest" } | { kind: "account"; email: string };

const SCORE_NOTICE_MS = 600;

const whoFrom = (a: call.AccountAnswer): Who => (!a.user ? { kind: "none" } : a.user.guest ? { kind: "guest" } : { kind: "account", email: a.user.email ?? "" });

/**
 * The rating flow's state: the places picked as Been (the queue), Want to try
 * and Not been marks, what was rated, the current step, and the undo stack.
 * Every write goes through `run`, which keeps one action at a time.
 */
export function useRateFlow() {
  const [step, setStep] = useState<Step>("pick");
  const [index, setIndex] = useState(0);
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [rated, setRated] = useState<Record<string, Rated>>({});
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [who, setWho] = useState<Who>({ kind: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAccount = () =>
    call.getAccount().then(
      (a) => {
        setWho(whoFrom(a));
        setProgress(a.user ? a.progress : { rated: 0, firstPicksAt: 5, goal: 10 });
      },
      () => setWho({ kind: "none" }),
    );
  useEffect(() => {
    void refreshAccount();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const current: Candidate | undefined = queue[index];
  const currentRated = current ? rated[current.place.id] : undefined;
  const setOne = (placeId: string, fn: (r: Rated) => Rated) => setRated((all) => (all[placeId] ? { ...all, [placeId]: fn(all[placeId]) } : all));
  const afterVisitCountChange = () => void call.getProgress().then(setProgress, () => undefined);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** On to the next unrated place after `from`, else the finish. Places skipped earlier stay skipped. */
  function advance(from: number, q: readonly Candidate[] = queue, r: Readonly<Record<string, Rated>> = rated) {
    const ahead = nextUnrated(q, r, from + 1);
    setNotice(null);
    if (ahead === -1) setStep("finish");
    else {
      setIndex(ahead);
      setStep("rate");
    }
  }

  // ---- Step A
  const toggleBeen = (c: Candidate) => {
    if (rated[c.place.id] || marks[c.place.id]) return;
    setQueue((q) => toggleQueue(q, c));
  };

  const mark = (c: Candidate, kind: Mark) =>
    run(async () => {
      if (rated[c.place.id] || marks[c.place.id]) return;
      await (kind === "want" ? call.wantToTry(c.place.id) : call.notBeen(c.place.id));
      if (who.kind === "none") setWho({ kind: "guest" });
      setMarks((m) => ({ ...m, [c.place.id]: kind }));
      setQueue((q) => q.filter((x) => x.place.id !== c.place.id));
      setUndo((u) => pushUndo(u, { kind, placeId: c.place.id }));
    });

  const start = () => {
    const first = nextUnrated(queue, rated, 0);
    if (first === -1) return setStep("finish");
    setIndex(first);
    setStep("rate");
  };

  // ---- Step B
  async function edit(placeId: string, visitId: string, fields: VisitPatch, before: Rated) {
    const res = await call.editVisit(visitId, fields);
    setOne(placeId, (r) => ({ ...r, reaction: res.visit.reaction, rating: res.visit.rating, occasion: res.visit.occasion, score: res.score, stale: true }));
    setUndo((u) => pushUndo(u, { kind: "edit", visitId, placeId, index, before: { reaction: before.reaction, rating: before.rating, occasion: before.occasion } }));
  }

  const react = (reaction: Reaction, rating: number | null) =>
    run(async () => {
      if (!current) return;
      const id = current.place.id;
      const was = rated[id];
      if (was) {
        if (was.reaction !== reaction || was.rating !== rating) await edit(id, was.visitId, { reaction, rating }, was);
        return;
      }
      const res = await call.rate(id, reaction, current.occasion, rating);
      if (who.kind === "none") setWho({ kind: "guest" });
      const limit = compareLimit(progress?.rated ?? 0);
      setRated((all) => ({ ...all, [id]: { visitId: res.visit.id, reaction, rating, occasion: res.visit.occasion, score: res.score, opponent: res.opponent, asked: 0, limit, stale: false } }));
      setProgress((p) => (p ? { ...p, rated: p.rated + 1 } : p));
      setUndo((u) => pushUndo(u, { kind: "visit", visitId: res.visit.id, placeId: id, index }));
      afterVisitCountChange();
    });

  const fineTune = (rating: number) => currentRated && react(currentRated.reaction, rating);

  const setOccasion = (occasion: Occasion) => {
    if (!current) return;
    const id = current.place.id;
    const was = rated[id];
    if (!was) return setQueue((q) => q.map((c) => (c.place.id === id ? { ...c, occasion } : c)));
    if (was.occasion !== occasion) void run(() => edit(id, was.visitId, { occasion }, was));
  };

  const saveDetails = (fields: VisitPatch) =>
    run(async () => {
      if (!current || !currentRated) return;
      const res = await call.editVisit(currentRated.visitId, fields);
      setOne(current.place.id, (r) => ({ ...r, score: res.score }));
      setNotice("Details saved");
    });

  /** Step B's "Next place": a question first when this place is due one. */
  const next = () =>
    run(async () => {
      if (!current) return;
      const r = rated[current.place.id];
      if (!r || !wantsQuestion(r)) return advance(index);
      let opponent = r.opponent;
      if (r.stale) {
        opponent = (await call.nextOpponent(current.place.id, r.occasion, r.asked)).opponent;
        setOne(current.place.id, (x) => ({ ...x, opponent, stale: false }));
      }
      if (opponent) setStep("compare");
      else advance(index);
    });

  /** W or S on a place not rated yet: Want to try or Not been instead, then the next place. */
  const instead = (kind: Mark) =>
    run(async () => {
      if (!current || rated[current.place.id]) return;
      const id = current.place.id;
      await (kind === "want" ? call.wantToTry(id) : call.notBeen(id));
      setMarks((m) => ({ ...m, [id]: kind }));
      setUndo((u) => pushUndo(u, { kind, placeId: id }));
      const q = queue.filter((c) => c.place.id !== id);
      setQueue(q);
      advance(index - 1, q);
    });

  const back = () => {
    setNotice(null);
    if (step === "compare") return setStep("rate");
    if (step === "finish") return setStep(queue.length ? "rate" : "pick");
    if (index > 0) setIndex(index - 1);
    else setStep("pick");
  };

  // ---- Step C
  const choose = (winner: Place) =>
    run(async () => {
      if (!current || !currentRated?.opponent) return;
      const subject = current.place;
      const r = currentRated;
      const loser = winner.id === subject.id ? r.opponent! : subject;
      const asked = r.asked + 1;
      const res = await call.answer(winner.id, loser.id, r.occasion, subject.id, asked);
      const score = res.subjectScore ?? res.score;
      const updated: Rated = { ...r, score, asked, opponent: asked < r.limit ? res.opponent : null };
      setRated((all) => ({ ...all, [subject.id]: updated }));
      setUndo((u) => pushUndo(u, { kind: "compare", id: res.id, placeId: subject.id, occasion: r.occasion, index, askedBefore: r.asked }));
      if (score !== null) setNotice(`${subject.name} is now ${score.toFixed(1)}`);
      const i = index;
      timer.current = setTimeout(() => {
        if (updated.opponent) setNotice(null);
        else advance(i, queue, { ...rated, [subject.id]: updated });
      }, SCORE_NOTICE_MS);
    });

  const tooTough = () => {
    if (!current) return;
    const r = { ...rated, [current.place.id]: { ...rated[current.place.id], opponent: null, stale: false } };
    setRated(r);
    advance(index, queue, r);
  };

  // ---- Undo
  const undoLast = () =>
    run(async () => {
      const popped = popUndo(undo);
      if (!popped) return;
      const e = popped.entry;
      if (timer.current) clearTimeout(timer.current);
      setNotice(null);
      const at = (placeId: string) => queue.findIndex((c) => c.place.id === placeId);
      switch (e.kind) {
        case "want":
        case "skip":
          await (e.kind === "want" ? call.unwant(e.placeId) : call.unskip(e.placeId));
          setMarks((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== e.placeId)));
          setStep("pick");
          break;
        case "visit": {
          await call.deleteVisit(e.visitId);
          setRated((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== e.placeId)));
          setProgress((p) => (p ? { ...p, rated: Math.max(0, p.rated - 1) } : p));
          afterVisitCountChange();
          const i = at(e.placeId);
          if (i === -1) setStep("pick");
          else {
            setIndex(i);
            setStep("rate");
          }
          break;
        }
        case "edit": {
          const res = await call.editVisit(e.visitId, e.before);
          setOne(e.placeId, (r) => ({ ...r, ...e.before, score: res.score, stale: true }));
          setIndex(Math.max(0, at(e.placeId)));
          setStep("rate");
          break;
        }
        case "compare": {
          const { score } = await call.undoAnswer(e.id, e.placeId);
          const { opponent } = await call.nextOpponent(e.placeId, e.occasion, e.askedBefore);
          setOne(e.placeId, (r) => ({ ...r, score, asked: e.askedBefore, opponent, stale: false }));
          setIndex(Math.max(0, at(e.placeId)));
          setStep(opponent ? "compare" : "rate");
          break;
        }
      }
      setUndo(popped.rest);
    });

  return {
    step, setStep, index, queue, marks, rated, undo, busy, error, notice, progress, who, current, currentRated,
    toggleBeen, mark, start, react, fineTune, setOccasion, saveDetails, next, instead, back, choose, tooTough, undoLast,
    refreshAccount,
  };
}

export type RateFlowModel = ReturnType<typeof useRateFlow>;
