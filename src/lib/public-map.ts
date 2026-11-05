// Public web maps at joinpins.app/@username. Data comes only from the get_public_web_map RPC in the
// Pins Supabase project (Pins repo: supabase/migrations/20261102000100_public_web_maps.sql), called
// with the public anon key and no session. The database decides what is public; this module only
// validates the response shape so a malformed or unexpected field can never reach the page.

export type PublicMapCategory = { name: string; icon: string | null; color: string | null };
export type PublicMapPin = {
  id: string;
  title: string;
  note: string | null;
  placeName: string | null;
  linkUrl: string | null;
  latitude: number;
  longitude: number;
  category: PublicMapCategory;
  /** Present only on saved copies. `username` is null when the original creator does not publish a map. */
  savedFrom: { username: string | null; displayName: string | null } | null;
};
export type PublicMap = {
  username: string;
  displayName: string | null;
  bio: string | null;
  publicPinCount: number;
  pins: PublicMapPin[];
  truncated: boolean;
};
export type PublicMapResult =
  | { status: "ready"; map: PublicMap }
  // Unknown, private, disabled and invalid usernames are deliberately indistinguishable.
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "not-configured" };

const USERNAME = /^[a-z0-9_.]{3,30}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_PINS = 2000;

/** `/@Alan/` → `alan`. Anything else (extra segments, encoded characters, invalid names) → null. */
export function usernameFromPath(pathname: string): string | null {
  const match = /^\/@([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const username = match[1].toLowerCase();
  return USERNAME.test(username) ? username : null;
}

/** `?pin=<id>` from a link shared in the app. Anything else is ignored, and an unknown id opens the map as usual. */
export function pinIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("pin");
  return id && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : null;
}

export function publicMapPath(username: string) {
  return `/@${username}`;
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};
const finite = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const httpUrl = (value: unknown): string | null => {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // A user:password@ prefix can make a link look like a different site.
    if (url.username || url.password) return null;
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parsePin(value: unknown): PublicMapPin | null {
  if (!isObject(value)) return null;
  const id = text(value.id, 64);
  const title = text(value.title, 200);
  const latitude = finite(value.latitude, -90, 90);
  const longitude = finite(value.longitude, -180, 180);
  if (!id || !title || latitude === null || longitude === null) return null;
  const category = isObject(value.category) ? value.category : {};
  const icon = text(category.icon, 16);
  const color = text(category.color, 7);
  const saved = isObject(value.saved_from) ? value.saved_from : null;
  const rawSavedUsername = saved ? text(saved.username, 30)?.toLowerCase() ?? null : null;
  const savedUsername = rawSavedUsername && USERNAME.test(rawSavedUsername) ? rawSavedUsername : null;
  return {
    id, title, latitude, longitude,
    note: text(value.note, 2000),
    placeName: text(value.place_name, 200),
    linkUrl: httpUrl(value.link_url),
    category: { name: text(category.name, 40) ?? "Pin", icon, color: color && HEX_COLOR.test(color) ? color : null },
    savedFrom: saved ? {
      username: savedUsername,
      displayName: savedUsername ? text(saved.display_name, 80) : null,
    } : null,
  };
}

export function parsePublicMap(value: unknown, requestedUsername: string): PublicMap | null {
  if (!isObject(value) || !isObject(value.profile) || !Array.isArray(value.pins)) return null;
  const username = text(value.profile.username, 30)?.toLowerCase();
  // The RPC matches case-insensitively; anything else means the response is not for this page.
  if (!username || username !== requestedUsername) return null;
  const pins = value.pins.slice(0, MAX_PINS).map(parsePin).filter((pin): pin is PublicMapPin => pin !== null);
  const count = finite(value.profile.public_pin_count, 0, Number.MAX_SAFE_INTEGER);
  return {
    username,
    displayName: text(value.profile.display_name, 80),
    bio: text(value.profile.bio, 300),
    publicPinCount: count === null ? pins.length : Math.max(Math.floor(count), pins.length),
    pins,
    truncated: value.truncated === true,
  };
}

export type PublicMapConfig = { supabaseUrl: string; anonKey: string };

export function publicMapConfig(env: { url?: string; anonKey?: string }): PublicMapConfig | null {
  const url = env.url?.trim().replace(/\/+$/, "");
  const anonKey = env.anonKey?.trim();
  if (!url || !anonKey || !/^https:\/\/[a-z0-9.-]+$/i.test(url)) return null;
  return { supabaseUrl: url, anonKey };
}

const REQUEST_TIMEOUT_MS = 15000;

export async function fetchPublicMap(username: string, config: PublicMapConfig | null, fetcher: typeof fetch = fetch, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<PublicMapResult> {
  if (!config) return { status: "not-configured" };
  // A stalled connection must end in the retry message, not an endless "Loading map…".
  const request = new AbortController();
  const cancel = () => request.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel);
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/get_public_web_map`, {
      method: "POST",
      // Anonymous by design: never send a user session, cookies or a referrer.
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ target_username: username }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: request.signal,
    });
    if (!response.ok) return { status: "error" };
    const body: unknown = await response.json();
    if (body === null) return { status: "unavailable" };
    const map = parsePublicMap(body, username);
    return map ? { status: "ready", map } : { status: "error" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "error" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export function displayNameFor(map: Pick<PublicMap, "displayName" | "username">) {
  return map.displayName ?? `@${map.username}`;
}
