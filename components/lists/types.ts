import type { Occasion, Place, PlaceScore, Reaction, Visit, WantItem } from "@/lib/types";

// Shapes the logging and lists API routes answer with, shared by routes and UI.

export type VisitsResponse = { visits: Visit[]; places: Place[]; scores: PlaceScore[] };
export type WantResponse = { items: WantItem[]; places: Place[] };

/** After logging a visit or answering a comparison: the score now, and what to ask next (null when done). */
export type CompareStep = { score: number | null; opponent: Place | null; asked: number };
export type LogResponse = { visit: Visit } & CompareStep;
/** POST /api/comparisons: the saved answer's id (to undo it) and the subject's score now (same as `score`, kept for older clients). */
export type CompareAnswer = CompareStep & { id: number; subjectScore: number | null };
/** PATCH /api/visits/:id: the visit and the place's fitted score in its (new) occasion. */
export type VisitEditResponse = { visit: Visit; score: number | null };

export type LiveDetailsView = {
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  openNow: boolean | null;
  hours: string[];
  summary: string | null;
};

export type PlaceResponse = { place: Place; live: LiveDetailsView | null; liveError: string | null; visits: Visit[]; scores: PlaceScore[]; wanted: boolean };

/** One row of the Been list: a place within one occasion. */
export type BeenRow = { place: Place; occasion: Occasion; score: number | null; reaction: Reaction; lastVisited: string; dated: boolean; visits: number };
