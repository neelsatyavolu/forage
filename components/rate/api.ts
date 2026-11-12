"use client";

import type { CompareAnswer, CompareStep, LogResponse, VisitEditResponse } from "@/components/lists/types";
import { api, del, patch, post } from "@/lib/client";
import type { Occasion, Place, Progress, Reaction, VisitPatch } from "@/lib/types";
import { today } from "@/components/log/options";

// The rating flow's calls (contract: ios/docs/api.md, 2.9, 5.2-5.7 and 5A).

export type DeckPlace = { place: Place; distanceKm: number; guessedOccasion: Occasion; kind: string };
export type Deck = { places: DeckPlace[]; hasMore: boolean; progress: Progress };
export type AccountInfo = { email: string | null; guest: boolean; createdAt: number };
export type AccountAnswer = { user: null } | { user: AccountInfo; progress: Progress };

let guestStart: Promise<void> | null = null;

/** Makes this browser a guest before its first write; does nothing with a live session. Called once per page. */
export function ensureUser(): Promise<void> {
  guestStart ??= post("/api/account/guest", {}).then(
    () => undefined,
    (err: unknown) => {
      guestStart = null;
      throw err;
    },
  );
  return guestStart;
}

export const getAccount = () => api<AccountAnswer>("/api/account");
export const getProgress = () => api<Progress>("/api/rate/progress");

export const loadDeck = (at: { lat: number; lng: number }, exclude: string[], signal?: AbortSignal) =>
  post<Deck>("/api/rate/deck", { lat: at.lat, lng: at.lng, exclude: exclude.slice(-500) }, signal);

export async function wantToTry(placeId: string): Promise<void> {
  await ensureUser();
  await post("/api/want", { placeId, source: "rate" });
}
export const unwant = (placeId: string) => del("/api/want", { placeId });

export async function notBeen(placeId: string): Promise<void> {
  await ensureUser();
  await post("/api/rate/skips", { placeId });
}
export const unskip = (placeId: string) => del("/api/rate/skips", { placeId });

/** The rating tap: today's date, marked undated, with the guessed occasion. */
export async function rate(placeId: string, reaction: Reaction, occasion: Occasion, rating: number | null): Promise<LogResponse> {
  await ensureUser();
  return post<LogResponse>("/api/visits", { placeId, visitedOn: today(), reaction, occasion, rating, dated: false });
}

export const editVisit = (visitId: string, fields: VisitPatch) => patch<VisitEditResponse>(`/api/visits/${visitId}`, fields);
export const deleteVisit = (visitId: string) => del(`/api/visits/${visitId}`, {});

/** One answer; `asked` counts it. The reply carries the subject's new score and the next opponent. */
export const answer = (winner: string, loser: string, occasion: Occasion, subject: string, asked: number) =>
  post<CompareAnswer>("/api/comparisons", { comparison: { winnerPlaceId: winner, loserPlaceId: loser, occasion }, next: { subjectPlaceId: subject, asked } });

export const undoAnswer = (id: number, placeId: string) => del<{ score: number | null }>(`/api/comparisons/${id}?placeId=${encodeURIComponent(placeId)}`, {});

export const nextOpponent = (placeId: string, occasion: Occasion, asked: number) =>
  api<CompareStep>(`/api/comparisons/next?placeId=${encodeURIComponent(placeId)}&occasion=${occasion}&asked=${asked}`);

export async function saveAccount(email: string, password: string): Promise<void> {
  await post("/api/account/register", { email, password });
}
export const signIn = (email: string, password: string) => post<{ merged?: { visits: number } }>("/api/account/login", { email, password });
