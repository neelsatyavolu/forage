"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass, Spinner } from "@/components/ui";
import { api, post } from "@/lib/client";
import type { Place } from "@/lib/types";
import type { TripSummary } from "./types";

type Day = { day: string; meals: { title: string; time: string | null }[] };
type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; days: Day[] };

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

/** Pick a trip and a day (with what's already planned for meals that day) and add the place as a planned meal. */
export function AddToTrip({ place, trips, initialTripId, onClose }: { place: Place; trips: TripSummary[]; initialTripId: string | null; onClose: () => void }) {
  const [tripId, setTripId] = useState(initialTripId ?? trips[0]?.id ?? "");
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded({ status: "loading" });
    setDay("");
    api<{ days: Day[] }>(`/api/lodestar/trips/${tripId}`)
      .then(({ days }) => live && setLoaded({ status: "ready", days }))
      .catch((err: unknown) => live && setLoaded({ status: "error", message: err instanceof Error ? err.message : "Couldn't load the trip." }));
    return () => {
      live = false;
    };
  }, [tripId]);

  const save = async () => {
    setError(null);
    if (!day) return setError("Pick a day.");
    setSaving(true);
    try {
      await post("/api/lodestar/add", { tripId, placeId: place.id, day, time: time || null, note: note.trim() || null });
      setDone(`Added to ${trips.find((t) => t.id === tripId)?.title ?? "the trip"} on ${day}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it.");
    } finally {
      setSaving(false);
    }
  };

  const footer = done ? (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[14px] text-ok">{done}</p>
      <Button onClick={onClose}>Close</Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[12px] text-danger">{error}</span>
      <Button variant="primary" onClick={save} disabled={saving || loaded.status !== "ready"}>
        {saving && <Spinner />}
        Add to trip
      </Button>
    </div>
  );

  return (
    <Dialog open onClose={onClose} title={`Add ${place.name} to a trip`} footer={footer}>
      <div className="space-y-6 px-6 py-6">
        {trips.length > 1 && (
          <Field label="Trip">
            <select className={inputClass} value={tripId} onChange={(e) => setTripId(e.target.value)} disabled={Boolean(done)}>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <DayChoice loaded={loaded} day={day} onDay={setDay} disabled={Boolean(done)} />
        <div className="grid grid-cols-[140px_1fr] gap-4">
          <Field label="Time (optional)">
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} disabled={Boolean(done)} />
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Book ahead, ask for the counter" disabled={Boolean(done)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function DayChoice({ loaded, day, onDay, disabled }: { loaded: Loaded; day: string; onDay: (d: string) => void; disabled: boolean }) {
  if (loaded.status === "loading") return <div className="skeleton h-24 rounded-sm" aria-label="Loading the trip" />;
  if (loaded.status === "error") return <p className="font-mono text-[12px] text-danger">{loaded.message}</p>;
  if (!loaded.days.length)
    return (
      <Field label="Day" hint="This trip has no dates yet.">
        <input type="date" className={inputClass} value={day} onChange={(e) => onDay(e.target.value)} disabled={disabled} />
      </Field>
    );
  return (
    <fieldset>
      <legend className="mb-2 font-mono text-[12px] text-mute">Day</legend>
      <ul className="border-t border-hairline">
        {loaded.days.map((d) => (
          <li key={d.day}>
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 border-b border-hairline px-2 py-2 ${day === d.day ? "bg-wash" : "hover:bg-hover"}`}>
              <input type="radio" name="day" value={d.day} checked={day === d.day} onChange={() => onDay(d.day)} disabled={disabled} className="accent-[var(--accent)]" />
              <span className="w-28 shrink-0 font-mono text-[13px] tnum">
                {weekday(d.day)} {d.day.slice(5)}
              </span>
              <span className="min-w-0 truncate text-[13px] text-mute">{d.meals.length ? d.meals.map((m) => (m.time ? `${m.time} ${m.title}` : m.title)).join(", ") : "No meals planned"}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
