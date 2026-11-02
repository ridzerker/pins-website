"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import type { PublicMapPin } from "@/lib/public-map";
import { softenBasicMapStyle } from "@/lib/pins-map-style";
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

type FeatureProps = { id?: string; icon?: string; color?: string; title?: string; cluster?: boolean; cluster_id?: number; point_count?: number };

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
        map = new maplibre.Map({ container: container.current, style, center: [-98, 39], zoom: 2.4, attributionControl: { compact: true },
          cooperativeGestures: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxZoom: 18 });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
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
              const element = document.createElement("button");
              element.type = "button";
              if (props.cluster) {
                const count = props.point_count ?? 0;
                element.className = styles.cluster;
                element.textContent = count >= 1000 ? `${Math.floor(count / 1000)}k` : String(count);
                element.setAttribute("aria-label", `${count} pins here. Zoom in`);
                const clusterId = props.cluster_id!;
                const [lng, lat] = feature.geometry.coordinates;
                element.addEventListener("click", async () => {
                  const zoom = await (current.getSource("pins") as GeoJSONSource).getClusterExpansionZoom(clusterId);
                  current.easeTo({ center: [lng, lat], zoom: Math.min(zoom, 17) });
                });
              } else {
                element.className = styles.marker;
                element.style.setProperty("--pin-color", props.color || "#3F7D5A");
                const glyph = document.createElement("span");
                glyph.setAttribute("aria-hidden", "true");
                glyph.textContent = props.icon || "";
                element.append(glyph);
                if (!props.icon) element.classList.add(styles.markerDot);
                element.setAttribute("aria-label", props.title ?? "Pin");
                const id = props.id!;
                element.addEventListener("click", event => { event.stopPropagation(); latest.current.onSelect(id); });
              }
              const coordinates = feature.geometry.coordinates as [number, number];
              const marker = new maplibre.Marker({ element, anchor: props.cluster ? "center" : "bottom" }).setLngLat(coordinates).addTo(current);
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
          current.addSource("pins", { type: "geojson", data: geojson(latest.current.pins), cluster: true, clusterRadius: 52, clusterMaxZoom: 15 });
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
    if (!pin) return;
    const point = map.project([pin.longitude, pin.latitude]);
    const { clientWidth, clientHeight } = map.getContainer();
    const inside = point.x > 40 && point.y > 40 && point.x < clientWidth - 40 && point.y < clientHeight - 40;
    if (!inside || map.getZoom() < 11) map.easeTo({ center: [pin.longitude, pin.latitude], zoom: Math.max(map.getZoom(), 13) });
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
    properties: { id: pin.id, icon: pin.category.icon ?? "", color: pin.category.color ?? "", title: pin.title },
  })) };
}

function frame(map: MapLibreMap, pins: PublicMapPin[], animate: boolean) {
  if (!pins.length) return;
  if (pins.length === 1) { map.jumpTo({ center: [pins[0].longitude, pins[0].latitude], zoom: 13 }); return; }
  let [west, south, east, north] = [180, 90, -180, -90];
  for (const pin of pins) { west = Math.min(west, pin.longitude); east = Math.max(east, pin.longitude); south = Math.min(south, pin.latitude); north = Math.max(north, pin.latitude); }
  map.fitBounds([[west, south], [east, north]], { padding: { top: 64, bottom: 48, left: 48, right: 48 }, maxZoom: 14, animate, duration: animate ? 600 : 0 });
}
