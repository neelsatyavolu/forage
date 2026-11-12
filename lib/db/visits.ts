import { randomUUID } from "node:crypto";
import type { Occasion, Visit, VisitInput, VisitPatch } from "../types";
import type { Queryable, Row } from "./client";
import { fromTs, toTs } from "./time";

const COLUMNS = "id, user_id, place_id, to_char(visited_on, 'YYYY-MM-DD') AS visited_on, reaction, occasion, rating, dated, dishes, note, created_at";

const rowToVisit = (r: Row): Visit => ({
  id: r.id as string,
  userId: r.user_id as string,
  placeId: r.place_id as string,
  visitedOn: r.visited_on as string,
  reaction: r.reaction as Visit["reaction"],
  occasion: r.occasion as Visit["occasion"],
  rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
  dated: r.dated === undefined ? true : Boolean(r.dated),
  dishes: (r.dishes as string[] | null) ?? [],
  note: (r.note as string | null) ?? null,
  createdAt: fromTs(r.created_at),
});

/** Older callers may leave out rating (null) and dated (true). */
export type NewVisit = Omit<VisitInput, "rating" | "dated"> & Partial<Pick<VisitInput, "rating" | "dated">>;

export async function insertVisit(q: Queryable, userId: string, input: NewVisit, now: number): Promise<Visit> {
  const [row] = await q.query(
    `INSERT INTO visits (id, user_id, place_id, visited_on, reaction, occasion, rating, dated, dishes, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
    [randomUUID(), userId, input.placeId, input.visitedOn, input.reaction, input.occasion, input.rating ?? null, input.dated ?? true, input.dishes, input.note, toTs(now)],
  );
  return rowToVisit(row);
}

export async function getVisit(q: Queryable, userId: string, id: string): Promise<Visit | null> {
  const [row] = await q.query(`SELECT ${COLUMNS} FROM visits WHERE user_id = $1 AND id = $2`, [userId, id]);
  return row ? rowToVisit(row) : null;
}

export type VisitFilter = { occasion?: Occasion; placeId?: string; limit?: number };

/** The user's visits, newest first. */
export async function listVisits(q: Queryable, userId: string, filter: VisitFilter = {}): Promise<Visit[]> {
  const rows = await q.query(
    `SELECT ${COLUMNS} FROM visits
     WHERE user_id = $1 AND ($2::text IS NULL OR occasion = $2) AND ($3::uuid IS NULL OR place_id = $3)
     ORDER BY visited_on DESC, created_at DESC LIMIT $4`,
    [userId, filter.occasion ?? null, filter.placeId ?? null, filter.limit ?? 1000],
  );
  return rows.map(rowToVisit);
}

/** Changes the given fields of the user's own visit. Null when there is no such visit. */
export async function updateVisit(q: Queryable, userId: string, id: string, patch: VisitPatch): Promise<Visit | null> {
  const current = await getVisit(q, userId, id);
  if (!current) return null;
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Visit;
  const [row] = await q.query(
    `UPDATE visits SET visited_on = $3, reaction = $4, occasion = $5, rating = $6, dated = $7, dishes = $8, note = $9
     WHERE user_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    [userId, id, next.visitedOn, next.reaction, next.occasion, next.rating, next.dated, next.dishes, next.note],
  );
  return row ? rowToVisit(row) : null;
}

export async function deleteVisit(q: Queryable, userId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM visits WHERE user_id = $1 AND id = $2 RETURNING id", [userId, id])).length === 1;
}
