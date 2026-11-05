// How a pin looks, vendored from the Pins app so the public map and the app cannot drift apart
// (constants/designPalette.ts, constants/pinCategories.ts, lib/mapOverview.ts). The app is the source
// of truth: change it there first. scripts/test-marker-parity.mjs compares these values with the app
// source when the two repositories sit side by side.
import type { PublicMapCategory } from "./public-map";

export const CATEGORY_COLORS = ["#FF6B6B", "#FF8E3C", "#FFD166", "#7BD389", "#2EC4B6", "#4D96FF", "#6C63FF", "#9D4EDD", "#F15BB5", "#C77D52"] as const;
const CATEGORY_DEFAULTS = {
  food: CATEGORY_COLORS[1], drinks: CATEGORY_COLORS[4], hikes: CATEGORY_COLORS[3], shopping: CATEGORY_COLORS[8], event: CATEGORY_COLORS[5], other: CATEGORY_COLORS[6],
  hangout: CATEGORY_COLORS[4], study: CATEGORY_COLORS[5], view: CATEGORY_COLORS[3],
} as const satisfies Record<string, string>;

const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));

/** Approved colors stay; legacy defaults map by identity; other hexes go to the nearest approved color. */
export function normalizeCategoryColor(value: string | null | undefined, defaultKey?: string | null): string {
  const color = value?.trim().toUpperCase() ?? "";
  if ((CATEGORY_COLORS as readonly string[]).includes(color)) return color;
  if (defaultKey && Object.prototype.hasOwnProperty.call(CATEGORY_DEFAULTS, defaultKey)) return CATEGORY_DEFAULTS[defaultKey as keyof typeof CATEGORY_DEFAULTS];
  if (!/^#[0-9A-F]{6}$/.test(color)) return CATEGORY_DEFAULTS.other;
  const source = rgb(color);
  const distance = (hex: string) => rgb(hex).reduce((sum, channel, index) => sum + (channel - source[index]) ** 2, 0);
  return CATEGORY_COLORS.reduce<string>((best, candidate) => distance(candidate) < distance(best) ? candidate : best, CATEGORY_COLORS[0]);
}

export const getCategorySymbol = (name?: string | null, icon?: string | null): string =>
  icon?.trim() || Array.from(name?.trim() ?? "")[0]?.toUpperCase() || "P";

const KNOWN_ICONS: Record<string, { icon: string; oldSeed?: string }> = {
  Food: { icon: "🍔", oldSeed: "F" }, Drinks: { icon: "🥤" }, Hikes: { icon: "⛰️" }, Shopping: { icon: "🛍️", oldSeed: "B" },
  Event: { icon: "🎟️", oldSeed: "E" }, Other: { icon: "📍", oldSeed: "P" }, Hangout: { icon: "☕", oldSeed: "H" }, Study: { icon: "📚", oldSeed: "S" }, View: { icon: "🌄", oldSeed: "V" },
};

/**
 * The marker color and symbol the app shows for a category. The app also checks is_default and
 * default_key before replacing an old seed icon; the public RPC does not return them, so a custom
 * category that reuses a default's exact name and placeholder letter shows the default emoji here.
 */
export function pinAppearance(category: PublicMapCategory): { color: string; symbol: string } {
  const known = Object.prototype.hasOwnProperty.call(KNOWN_ICONS, category.name) ? KNOWN_ICONS[category.name] : undefined;
  const icon = category.icon?.trim();
  const placeholder = !icon || icon === known?.oldSeed || icon === category.name[0];
  return {
    color: normalizeCategoryColor(category.color, category.name.toLowerCase()),
    symbol: getCategorySymbol(category.name, known && placeholder ? known.icon : icon),
  };
}

type Point = { latitude: number; longitude: number };
export const MAP_OVERVIEW_PADDING = { top: 44, right: 32, bottom: 32, left: 32 };
export const NEUTRAL_MAP_CENTER: Point = { latitude: 20, longitude: 0 };

export const uniquePoints = <T extends Point>(points: T[]): T[] => [...new Map(points.map(point => [`${point.latitude}:${point.longitude}`, point])).values()];

/** [west, south, east, north] over the shortest longitude arc, so maps crossing the date line stay useful. */
export function overviewBounds(points: Point[]): [number, number, number, number] {
  const unique = uniquePoints(points);
  const longitudes = unique.map(point => (point.longitude + 360) % 360).sort((a, b) => a - b);
  let gap = -1, start = 0;
  longitudes.forEach((longitude, index) => {
    const next = longitudes[(index + 1) % longitudes.length] + (index === longitudes.length - 1 ? 360 : 0);
    if (next - longitude > gap) { gap = next - longitude; start = (index + 1) % longitudes.length; }
  });
  const west = longitudes[start] > 180 ? longitudes[start] - 360 : longitudes[start];
  const latitudes = unique.map(point => point.latitude);
  return [west, Math.min(...latitudes), west + 360 - gap, Math.max(...latitudes)];
}

/** The app draws every pin and never clusters. A browser cannot move thousands of DOM markers per frame, so only very large maps cluster. */
export const CLUSTER_ABOVE_PINS = 300;
