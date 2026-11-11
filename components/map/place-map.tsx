"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { pinLabel, type MapPin } from "./pins";

// Places on a map, ported from Lodestar's trip map: OpenFreeMap's "liberty"
// tiles (free, no key), MapLibre's worker served from public/ (see
// scripts/copy-maplibre-worker.mjs), and in dark mode the tile canvas is
// inverted rather than swapped for a dim style. Pins are flat: ink for
// places you've been (with the score), outlined for want-to-try, blue when
// selected. A click on a pin selects it.

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

function darkMode(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : !window.matchMedia("(prefers-color-scheme: light)").matches;
}

function pinElement(pin: MapPin, selected: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.title = pin.name;
  el.setAttribute("aria-label", pin.name);
  el.textContent = pinLabel(pin);
  const fill = selected ? "#2a63cc" : pin.kind === "want" ? "#ffffff" : "#16161a";
  const ink = selected || pin.kind === "been" ? "#ffffff" : "#16161a";
  el.style.cssText = [
    "display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 6px;border-radius:9999px;",
    "font:500 11px/1 var(--font-mono),ui-monospace,monospace;font-variant-numeric:tabular-nums;",
    `min-width:22px;height:22px;background:${fill};color:${ink};`,
    `border:1.5px solid ${pin.kind === "want" && !selected ? "#16161a" : "#ffffff"};`,
    selected ? "z-index:3;" : "z-index:1;",
  ].join("");
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export function PlaceMap({ pins, selectedId, onSelect, label = "Map of places" }: { pins: MapPin[]; selectedId: string | null; onSelect: (id: string) => void; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const key = pins.map((p) => `${p.id}:${p.lat},${p.lng}:${p.kind}:${p.score ?? ""}`).join("|");

  useEffect(() => {
    let cancelled = false;
    let instance: MlMap | null = null;
    import("maplibre-gl").then(({ Map: MapClass, NavigationControl, setWorkerUrl }) => {
      if (cancelled || !box.current) return;
      setWorkerUrl("/maplibre-gl-worker.mjs");
      setDark(darkMode());
      instance = new MapClass({ container: box.current, style: STYLE, center: [-98, 39], zoom: 2.5, attributionControl: { compact: true } });
      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
      instance.on("styleimagemissing", (e) => instance!.hasImage(e.id) || instance!.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }));
      instance.on("load", () => {
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        map.current = instance;
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let alive = true;
    import("maplibre-gl").then(({ Marker: MarkerClass, LngLatBounds }) => {
      if (!alive) return;
      markers.current.forEach((mk) => mk.remove());
      markers.current = pins.map((pin) =>
        new MarkerClass({ element: pinElement(pin, pin.id === selectedId, () => onSelect(pin.id)) }).setLngLat([pin.lng, pin.lat]).addTo(m),
      );
      const selected = pins.find((p) => p.id === selectedId);
      if (selected) {
        m.flyTo({ center: [selected.lng, selected.lat], zoom: Math.max(m.getZoom(), 14), duration: 600 });
        return;
      }
      // Frame the pins once per set, so a selection change doesn't jump the view back.
      if (fitted.current === key || pins.length === 0) return;
      fitted.current = key;
      if (pins.length === 1) m.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 14 });
      else {
        const bounds = new LngLatBounds();
        pins.forEach((p) => bounds.extend([p.lng, p.lat]));
        m.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      }
    });
    return () => {
      alive = false;
    };
    // `pins` is derived from `key`; onSelect is rebound with the markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, selectedId]);

  return <div ref={box} className={`h-full w-full overflow-hidden [contain:paint] ${dark ? "[&_canvas]:[filter:invert(0.92)_hue-rotate(180deg)_saturate(0.7)_brightness(0.95)]" : ""}`} aria-label={label} role="region" />;
}
