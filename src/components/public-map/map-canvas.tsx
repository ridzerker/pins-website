"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import type { PublicMapPin } from "@/lib/public-map";
import { softenBasicMapStyle } from "@/lib/pins-map-style";
import { CLUSTER_ABOVE_PINS, MAP_OVERVIEW_PADDING, NEUTRAL_MAP_CENTER, overviewBounds, pinAppearance, uniquePoints } from "@/lib/pins-marker";
import styles from "./public-map.module.css";

// Copied from node_modules by scripts/copy-maplibre-worker.mjs (prebuild/predev); versioned for caching.
export const MAPLIBRE_WORKER_URL = "/vendor/maplibre-gl-worker-6.14.0.mjs";
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() || null;
const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: "Background", type: "background", paint: { "background-color": "#EEEFE1" } }] };

async function loadStyle(): Promise<{ style: StyleSpecification | string; basemap: boolean }> {
  if (!MAPTILER_KEY) return { style: FALLBACK_STYLE, basemap: false };
  const url = `https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`;
  try {
    const response = await fetch(url, { credentials: "omit", referrerPolicy: "strict-origin" });
    if (!response.ok) throw new Error("Map style unavailable");
    return { style: softenBasicMapStyle(await response.json()), basemap: true };
  } catch {
    // Unsoftened Basic still works; never log the URL (it carries the key).
    return { style: url, basemap: true };
  }
}

type FeatureProps = { id?: string; symbol?: string; color?: string; title?: string; cluster?: boolean; cluster_id?: number; point_count?: number };
const CLUSTER_COLOR = "#47745B"; // The app's marker base color (uiColors.accent).
const GLYPH_WIDTH = 24, GLYPH_SIZE = 16, GLYPH_MIN_SIZE = 8;

/** The DOM of components/PinsMarker.tsx in the app. MapLibre owns the outer element's transform, so only the inner body rotates. */
function createMarkerElement(color: string, symbol: string, label: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = styles.marker;
  element.setAttribute("aria-label", label);
  element.style.setProperty("--pin-color", color);
  const part = (className: string) => { const span = document.createElement("span"); span.className = className; span.setAttribute("aria-hidden", "true"); return span; };
  const body = part(styles.pinBody), center = part(styles.pinCenter), glyph = part(styles.pinGlyph);
  glyph.textContent = symbol;
  center.append(glyph);
  body.append(center);
  element.append(part(styles.pinHalo), body);
  return { element, glyph };
}

/** adjustsFontSizeToFit: symbols wider than the white center shrink, down to half size. */
function fitGlyph(glyph: HTMLElement) {
  if (Array.from(glyph.textContent ?? "").length < 2 || glyph.scrollWidth <= GLYPH_WIDTH) return;
  glyph.style.fontSize = `${Math.max(GLYPH_MIN_SIZE, GLYPH_SIZE * GLYPH_WIDTH / glyph.scrollWidth)}px`;
}

export function MapCanvas({ pins, selectedId, onSelect }: { pins: PublicMapPin[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const latest = useRef({ pins, selectedId, onSelect });
  useEffect(() => { latest.current = { pins, selectedId, onSelect }; });
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [basemap, setBasemap] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        const [maplibre, { style, basemap }] = await Promise.all([import("maplibre-gl"), loadStyle()]);
        if (cancelled || !container.current) return;
        maplibre.setWorkerUrl(new URL(MAPLIBRE_WORKER_URL, window.location.origin).href);
        setBasemap(basemap);
        map = new maplibre.Map({ container: container.current, style, center: [NEUTRAL_MAP_CENTER.longitude, NEUTRAL_MAP_CENTER.latitude], zoom: 1, attributionControl: { compact: true },
          cooperativeGestures: false, pitchWithRotate: false, touchPitch: false, maxZoom: 20 });
        map.addControl(new maplibre.NavigationControl({ showCompass: true, visualizePitch: false }), "top-right");
        // Like the app's compass, it appears only once the map is rotated. Tapping it returns to north.
        const showCompass = (rotated: boolean) => { container.current?.setAttribute("data-rotated", String(rotated)); };
        showCompass(false);
        map.on("rotate", () => showCompass(Math.abs(map!.getBearing()) > 0.5));
        mapRef.current = map;
        const current = map;

        const sync = () => {
          const seen = new Set<string>();
          for (const feature of current.querySourceFeatures("pins")) {
            const props = feature.properties as FeatureProps;
            const key = props.cluster ? `c${props.cluster_id}` : `p${props.id}`;
            if (seen.has(key) || feature.geometry.type !== "Point") continue;
            seen.add(key);
            let entry = markers.current.get(key);
            if (!entry) {
              const coordinates = feature.geometry.coordinates as [number, number];
              const count = props.point_count ?? 0;
              const { element, glyph } = props.cluster
                ? createMarkerElement(CLUSTER_COLOR, count >= 1000 ? `${Math.floor(count / 1000)}k` : String(count), `${count} pins here. Zoom in`)
                : createMarkerElement(props.color!, props.symbol!, props.title ?? "Pin");
              if (props.cluster) {
                element.classList.add(styles.markerCount);
                const clusterId = props.cluster_id!;
                const [lng, lat] = feature.geometry.coordinates;
                element.addEventListener("click", async () => {
                  const zoom = await (current.getSource("pins") as GeoJSONSource).getClusterExpansionZoom(clusterId);
                  current.easeTo({ center: [lng, lat], zoom: Math.min(zoom, 17), duration: 250 });
                });
              } else {
                const id = props.id!;
                element.addEventListener("click", event => { event.stopPropagation(); latest.current.onSelect(id); });
              }
              const marker = new maplibre.Marker({ element, anchor: "bottom" }).setLngLat(coordinates).addTo(current);
              fitGlyph(glyph);
              entry = { marker, element };
              markers.current.set(key, entry);
            }
            if (!props.cluster) {
              const selected = props.id === latest.current.selectedId;
              entry.element.classList.toggle(styles.markerSelected, selected);
              entry.element.setAttribute("aria-pressed", String(selected));
            }
          }
          for (const [key, entry] of markers.current) if (!seen.has(key)) { entry.marker.remove(); markers.current.delete(key); }
        };

        current.on("load", () => {
          if (cancelled) return;
          current.addSource("pins", { type: "geojson", data: geojson(latest.current.pins), cluster: latest.current.pins.length > CLUSTER_ABOVE_PINS, clusterRadius: 52, clusterMaxZoom: 15 });
          // An invisible layer keeps the source's tiles loaded so querySourceFeatures sees every point.
          current.addLayer({ id: "pins-hit", type: "circle", source: "pins", paint: { "circle-radius": 1, "circle-opacity": 0 } });
          frame(current, latest.current.pins, false);
          current.on("render", () => { if (current.isSourceLoaded("pins")) sync(); });
          current.on("click", () => latest.current.onSelect(null));
          setState("ready");
        });
        // Only a style that never loads fails the map; a missing tile just leaves a gap.
        current.on("error", () => { if (!current.isStyleLoaded()) setState(s => s === "ready" ? s : "failed"); });
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    const markerMap = markers.current;
    return () => {
      cancelled = true;
      for (const entry of markerMap.values()) entry.marker.remove();
      markerMap.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // New filter results: replace the data and reframe.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("pins") as GeoJSONSource | undefined;
    if (!map || !source) return;
    for (const entry of markers.current.values()) entry.marker.remove();
    markers.current.clear();
    source.setData(geojson(pins));
    frame(map, pins, true);
  }, [pins, state]);

  // Keep the selected pin in view and its marker highlighted.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.triggerRepaint();
    const pin = pins.find(item => item.id === selectedId);
    // The app's focusCoordinate: center on the pin at zoom 14 in 250 ms.
    if (pin) map.easeTo({ center: [pin.longitude, pin.latitude], zoom: 14, duration: 250 });
  }, [selectedId, pins]);

  return <div className={styles.mapFrame}>
    <div ref={container} className={styles.map} role="region" aria-label="Map of public pins" />
    {state === "loading" && <p className={styles.mapStatus} role="status">Loading map…</p>}
    {state === "failed" && <p className={styles.mapStatus} role="status">The map couldn’t load. The pins are listed below.</p>}
    {state === "ready" && !basemap && <p className={styles.mapNote}>Map background unavailable</p>}
  </div>;
}

function geojson(pins: PublicMapPin[]): GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProps> {
  return { type: "FeatureCollection", features: pins.map(pin => ({
    type: "Feature", geometry: { type: "Point", coordinates: [pin.longitude, pin.latitude] },
    properties: { id: pin.id, ...pinAppearance(pin.category), title: pin.title },
  })) };
}

/** The app's fitCoordinates. */
function frame(map: MapLibreMap, pins: PublicMapPin[], animate: boolean) {
  const points = uniquePoints(pins);
  if (!points.length) return;
  if (points.length === 1) { map.jumpTo({ center: [points[0].longitude, points[0].latitude], zoom: 11 }); return; }
  const [west, south, east, north] = overviewBounds(points);
  map.fitBounds([[west, south], [east, north]], { padding: MAP_OVERVIEW_PADDING, animate, duration: animate ? 250 : 0 });
}
