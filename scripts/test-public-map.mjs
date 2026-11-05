import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicMap, parsePublicMap, publicMapConfig, usernameFromPath } from "../src/lib/public-map.ts";
import { headersFor } from "./lib/vercel-headers.mjs";
import { CLUSTER_ABOVE_PINS, overviewBounds, pinAppearance, uniquePoints } from "../src/lib/pins-marker.ts";

const config = { supabaseUrl: "https://project.supabase.co", anonKey: "anon-test-key" };
const pin = (overrides = {}) => ({ id: "p1", title: "Taco Spot", note: "Al pastor", place_name: "Taco Spot", link_url: "https://example.com/taco",
  latitude: 34.05, longitude: -118.25, category: { name: "Food", icon: "🍔", color: "#FF8E3C" }, saved_from: null, ...overrides });
const body = (overrides = {}) => ({ profile: { username: "alan", display_name: "Alan", bio: "Tacos", public_pin_count: 1 }, pins: [pin()], truncated: false, ...overrides });

test("only /@username paths with valid usernames resolve", () => {
  assert.equal(usernameFromPath("/@alan"), "alan");
  assert.equal(usernameFromPath("/@Alan.Tran/"), "alan.tran");
  for (const path of ["/map/", "/@", "/@al", "/@alan/extra", "/@al%20an", "/@alan%2F..", "/alan", "/@" + "x".repeat(31), "/@alan?x", "//@alan"])
    assert.equal(usernameFromPath(path), null, path);
});

test("a valid response keeps only known, well-formed fields", () => {
  const map = parsePublicMap(body({ pins: [pin({ creator_id: "u1", circle_visibility: "all_circles", created_at: "2026-01-01" })], extra: "x" }), "alan");
  assert.deepEqual(map, { username: "alan", displayName: "Alan", bio: "Tacos", publicPinCount: 1, truncated: false, pins: [{
    id: "p1", title: "Taco Spot", note: "Al pastor", placeName: "Taco Spot", linkUrl: "https://example.com/taco", latitude: 34.05, longitude: -118.25,
    category: { name: "Food", icon: "🍔", color: "#FF8E3C" }, savedFrom: null }] });
});

test("unsafe or broken pins are dropped or neutralized, never rendered as-is", () => {
  const map = parsePublicMap(body({ pins: [
    pin({ id: "no-coords", latitude: null }), pin({ id: "nan", latitude: Number.NaN }), pin({ id: "far", longitude: 500 }), pin({ id: "string-coords", latitude: "34" }),
    pin({ id: "", title: "No id" }), pin({ id: "untitled", title: "   " }), "not a pin", null,
    pin({ id: "js", link_url: "javascript:alert(1)", category: { name: "X", icon: "🍔", color: "red;background:url(x)" } }),
    pin({ id: "no-category", category: null, note: "   " }),
  ] }), "alan");
  assert.deepEqual(map.pins.map(item => item.id), ["js", "no-category"]);
  assert.equal(map.pins[0].linkUrl, null);
  assert.equal(map.pins[0].category.color, null);
  assert.deepEqual(map.pins[1].category, { name: "Pin", icon: null, color: null });
  assert.equal(map.pins[1].note, null);
});

test("saved-copy attribution shows a creator only when the server named one", () => {
  const map = parsePublicMap(body({ pins: [
    pin({ id: "a", saved_from: { username: "quinn", display_name: "Quinn" } }),
    pin({ id: "b", saved_from: { username: null, display_name: "Leaked Name" } }),
    pin({ id: "c", saved_from: { username: "../evil", display_name: "Evil" } }),
  ] }), "alan");
  assert.deepEqual(map.pins.map(item => item.savedFrom), [{ username: "quinn", displayName: "Quinn" }, { username: null, displayName: null }, { username: null, displayName: null }]);
});

test("a response for a different profile, or a malformed one, is rejected", () => {
  assert.equal(parsePublicMap(body(), "bea"), null);
  for (const bad of [null, [], "x", { profile: {} }, { profile: { username: "alan" } }, { pins: [] }]) assert.equal(parsePublicMap(bad, "alan"), null);
});

test("large maps are capped and the public count is never below what is shown", () => {
  const pins = Array.from({ length: 2600 }, (_, n) => pin({ id: `p${n}` }));
  const map = parsePublicMap(body({ pins, truncated: true, profile: { username: "alan", public_pin_count: 3 } }), "alan");
  assert.equal(map.pins.length, 2000);
  assert.equal(map.publicPinCount, 2000);
  assert.equal(map.truncated, true);
});

test("config requires an https Supabase URL and a key", () => {
  assert.deepEqual(publicMapConfig({ url: "https://project.supabase.co/", anonKey: " key " }), { supabaseUrl: "https://project.supabase.co", anonKey: "key" });
  for (const env of [{}, { url: "https://project.supabase.co" }, { anonKey: "key" }, { url: "http://project.supabase.co", anonKey: "key" }, { url: "https://x.co/path", anonKey: "key" }])
    assert.equal(publicMapConfig(env), null);
});

test("the RPC is called anonymously with only the username, and null means unavailable", async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return new Response("null", { status: 200 }); };
  assert.deepEqual(await fetchPublicMap("alan", config, fetcher), { status: "unavailable" });
  const [{ url, init }] = calls;
  assert.equal(url, "https://project.supabase.co/rest/v1/rpc/get_public_web_map");
  assert.equal(init.method, "POST");
  assert.equal(init.body, JSON.stringify({ target_username: "alan" }));
  assert.equal(init.credentials, "omit");
  assert.equal(init.cache, "no-store");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.deepEqual(Object.keys(init.headers).sort(), ["Accept", "Authorization", "Content-Type", "apikey"]);
  assert.equal(init.headers.Authorization, "Bearer anon-test-key");
});

test("server errors, network errors and wrong-profile responses never show a map", async () => {
  assert.deepEqual(await fetchPublicMap("alan", null), { status: "not-configured" });
  assert.deepEqual(await fetchPublicMap("alan", config, async () => new Response("{}", { status: 500 })), { status: "error" });
  assert.deepEqual(await fetchPublicMap("alan", config, async () => { throw new TypeError("offline"); }), { status: "error" });
  assert.deepEqual(await fetchPublicMap("alan", config, async () => new Response(JSON.stringify(body()).replace('"alan"', '"bea"'))), { status: "error" });
  const ready = await fetchPublicMap("alan", config, async () => new Response(JSON.stringify(body())));
  assert.equal(ready.status, "ready");
  assert.equal(ready.map.pins.length, 1);
});

test("the committed MapLibre worker is the pinned package's worker, at the URL the map loads", async () => {
  const fs = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { version } = require("maplibre-gl/package.json");
  const canvas = await fs.readFile("src/components/public-map/map-canvas.tsx", "utf8");
  assert.ok(canvas.includes(`"/vendor/maplibre-gl-worker-${version}.mjs"`), "MAPLIBRE_WORKER_URL matches the installed version");
  const committed = await fs.readFile(`public/vendor/maplibre-gl-worker-${version}.mjs`);
  const installed = await fs.readFile(require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));
  assert.ok(committed.equals(installed), "Committed worker matches node_modules byte for byte");
  await fs.access("public/vendor/maplibre-gl-LICENSE.txt");
});

test("pins take the app's colors and symbols, whatever the category row holds", () => {
  assert.deepEqual(pinAppearance({ name: "Food", icon: "🍔", color: "#FF8E3C" }), { color: "#FF8E3C", symbol: "🍔" });
  assert.deepEqual(pinAppearance({ name: "Food", icon: "F", color: "#d9613c" }), { color: "#FF8E3C", symbol: "🍔" }, "An old seed row becomes the current default");
  assert.deepEqual(pinAppearance({ name: "Coffee", icon: "☕", color: "#8B5E3C" }), { color: "#C77D52", symbol: "☕" }, "An unapproved color goes to the nearest approved one");
  assert.deepEqual(pinAppearance({ name: "Books", icon: null, color: null }), { color: "#6C63FF", symbol: "B" });
  assert.deepEqual(pinAppearance({ name: "constructor", icon: null, color: null }), { color: "#6C63FF", symbol: "C" }, "Category names are data, never object keys");
});

test("the overview camera handles the date line and duplicate points", () => {
  assert.deepEqual(overviewBounds([{ latitude: 10, longitude: 179 }, { latitude: 12, longitude: -179 }]), [179, 10, 181, 12]);
  assert.equal(uniquePoints([{ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 }]).length, 1);
  assert.equal(CLUSTER_ABOVE_PINS, 300);
});

test("a stalled request ends in an error the page can retry, and a caller's abort still aborts", async () => {
  const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  assert.deepEqual(await fetchPublicMap("alan", config, hang, undefined, 5), { status: "error" });
  const caller = new AbortController();
  const pending = fetchPublicMap("alan", config, hang, caller.signal, 5000);
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("links hiding behind user:password@ are dropped", () => {
  const map = parsePublicMap(body({ pins: [pin({ link_url: "https://bank.example:secret@evil.example/" })] }), "alan");
  assert.equal(map.pins[0].linkUrl, null);
});

test("security headers cover every page, and maps stay private to crawlers and referrers", () => {
  for (const path of ["/", "/privacy/", "/@alan", "/@alan/", "/map/"]) {
    const headers = headersFor(path);
    assert.equal(headers["X-Content-Type-Options"], "nosniff", path);
    assert.equal(headers["X-Frame-Options"], "DENY", path);
    assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/, path);
    assert.match(headers["Content-Security-Policy"], /object-src 'none'/, path);
    assert.doesNotMatch(headers["Content-Security-Policy"], /unsafe-eval/, path);
    assert.match(headers["Strict-Transport-Security"], /max-age=\d{8}/, path);
    assert.match(headers["Permissions-Policy"], /geolocation=\(\)/, path);
  }
  for (const path of ["/@alan", "/@alan/", "/map/"]) {
    assert.equal(headersFor(path)["X-Robots-Tag"], "noindex, nofollow", path);
    assert.equal(headersFor(path)["Referrer-Policy"], "no-referrer", path);
  }
  assert.equal(headersFor("/")["X-Robots-Tag"], undefined, "The marketing site stays indexable");
  assert.equal(headersFor("/")["Referrer-Policy"], "strict-origin-when-cross-origin");
});
