// Which base map the public web map draws under its pins. Nothing external is contacted unless a
// provider is configured at build time. Turning one on also needs its host in vercel.json's
// connect-src, and the Privacy and Cookies pages updated: docs/public-maps-basemap.md lists the steps.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type Basemap =
  | { kind: "none" }
  | { kind: "maptiler"; styleUrl: string }
  | { kind: "openfreemap"; styleUrl: string };

export const OPENFREEMAP_ORIGIN = "https://tiles.openfreemap.org";

export function chooseBasemap(env: { provider?: string; maptilerKey?: string }): Basemap {
  const provider = env.provider?.trim().toLowerCase();
  const key = env.maptilerKey?.trim();
  if (provider === "openfreemap") return { kind: "openfreemap", styleUrl: `${OPENFREEMAP_ORIGIN}/styles/positron` };
  if ((provider === "maptiler" || !provider) && key) return { kind: "maptiler", styleUrl: `https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(key)}` };
  return { kind: "none" };
}

// The same colors as designPalette.map in the app (constants/designPalette.ts).
const map = {
  land: "#EEEFE1", residential: "#ECECDE", park: "#DCE5CA", forest: "#D5E0C4", water: "#D4E5E7", road: "#FCFBF5", casing: "#E1E2D6",
  path: "#D1D7C4", building: "#E1E2D6", border: "#C8D0C2", label: "#7C8981", roadLabel: "#89938B", anchorLabel: "#6F7C74",
};
const FILLS: Record<string, string> = { park: map.park, water: map.water, landcover_wood: map.forest, landuse_residential: map.residential, landcover_ice_shelf: "#FAF8F3", landcover_glacier: "#FAF8F3", "aeroway-area": map.building, road_area_pier: map.road };
const LINES: Record<string, string> = {
  waterway: map.water, highway_path: map.path, highway_minor: map.road, highway_major_inner: map.road, highway_major_subtle: map.road, highway_motorway_inner: map.road, highway_motorway_subtle: map.road,
  highway_motorway_bridge_inner: map.road, tunnel_motorway_inner: map.road, road_pier: map.road, highway_major_casing: map.casing, highway_motorway_casing: map.casing, highway_motorway_bridge_casing: map.casing, tunnel_motorway_casing: map.casing,
  "aeroway-taxiway": map.building, "aeroway-runway": map.building, "aeroway-runway-casing": map.building, boundary_2: map.border, boundary_3: map.border, boundary_disputed: map.border,
};
// The app hides transit and minor borders, and pins are the map's only markers.
const HIDDEN = /^railway|^highway-shield|^road_shield/;

/** OpenFreeMap Positron in the Pins palette. Layers it does not recognize keep their own look. */
export function softenPositronStyle(style: StyleSpecification): StyleSpecification {
  if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)
    || !["background", "water", "highway_minor"].every(id => style.layers.some(layer => layer.id === id))) {
    throw new Error("Unsupported base map style");
  }
  const layers = style.layers.map((layer): LayerSpecification => {
    if (HIDDEN.test(layer.id)) return { ...layer, layout: { ...layer.layout, visibility: "none" } } as LayerSpecification;
    if (layer.type === "background") return { ...layer, paint: { ...layer.paint, "background-color": map.land } };
    if (layer.type === "fill" && layer.id === "building") return { ...layer, minzoom: Math.max(14.5, layer.minzoom ?? 0), paint: { ...layer.paint, "fill-color": map.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 16, 1], "fill-outline-color": map.building } };
    if (layer.type === "fill" && FILLS[layer.id]) return { ...layer, paint: { ...layer.paint, "fill-color": FILLS[layer.id] } };
    if (layer.type === "line" && LINES[layer.id]) return { ...layer, paint: { ...layer.paint, "line-color": LINES[layer.id] } };
    if (layer.type === "symbol") {
      const color = layer.id.startsWith("highway-name") ? map.roadLabel : layer.id === "airport" ? map.anchorLabel : layer.id.includes("water") ? "#6F8F96" : map.label;
      return { ...layer, paint: { ...layer.paint, "text-color": color, "text-halo-color": map.land, "text-halo-width": 1 } };
    }
    return layer;
  });
  // Style changes must not supply a competing camera, and a source no layer uses is never needed.
  const used = new Set(layers.flatMap(layer => "source" in layer && layer.source ? [layer.source] : []));
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([id]) => used.has(id)));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { center, zoom, bearing, pitch, ...base } = style;
  return { ...base, sources, layers };
}
