import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fetchPublicMap, parsePublicMap, pinIdFromSearch, publicMapConfig, usernameFromPath } from "../src/lib/public-map.ts";
import { headersFor } from "./lib/vercel-headers.mjs";
import { problemsWith } from "./lib/build-env.mjs";
import { chooseBasemap, softenPositronStyle } from "../src/lib/map-provider.ts";
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

test("a response whose body stalls also times out", async () => {
  const stalledBody = async (_url, { signal }) => ({ ok: true, json: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) });
  assert.deepEqual(await fetchPublicMap("alan", config, stalledBody, undefined, 5), { status: "error" });
});

test("unexpected JSON never reaches the page", () => {
  for (const value of [[], "text", 7, {}, { profile: {} }, { profile: { username: "alan" }, pins: {} }, { profile: { username: "someone.else" }, pins: [] }]) assert.equal(parsePublicMap(value, "alan"), null);
  const map = parsePublicMap(body({ pins: [pin(), null, "x", pin({ latitude: "34" }), pin({ longitude: 999 }), pin({ title: {} }), pin({ private_note: "secret", user_id: "u1", category: { name: "Food", color: "red;background:url(x)" } })] }), "alan");
  assert.equal(map.pins.length, 2, "Malformed pins are skipped");
  assert.equal(map.pins[1].category.color, null, "A color must be a plain hex value");
  assert.deepEqual(Object.keys(map.pins[1]).sort(), ["category", "id", "latitude", "linkUrl", "longitude", "note", "placeName", "savedFrom", "title"], "Unknown fields are dropped, so they can never render");
  for (const link_url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "//evil.example", "not a url"]) assert.equal(parsePublicMap(body({ pins: [pin({ link_url })] }), "alan").pins[0].linkUrl, null, link_url);
});

test("a shared pin link accepts only a plain id", () => {
  assert.equal(pinIdFromSearch("?pin=5f0c2a1e-7b1d-4c11-9a11-0123456789ab"), "5f0c2a1e-7b1d-4c11-9a11-0123456789ab");
  for (const search of ["", "?other=1", "?pin=", "?pin=<script>", "?pin=a%20b", "?pin=" + "x".repeat(65)]) assert.equal(pinIdFromSearch(search), null, search);
});

test("a base map is only used when configured", () => {
  assert.deepEqual(chooseBasemap({}), { kind: "none" });
  assert.deepEqual(chooseBasemap({ provider: " ", maptilerKey: " " }), { kind: "none" });
  assert.deepEqual(chooseBasemap({ provider: "maptiler" }), { kind: "none" }, "MapTiler without a key contacts nobody");
  assert.deepEqual(chooseBasemap({ provider: "something-else", maptilerKey: "k" }), { kind: "none" });
  assert.equal(chooseBasemap({ maptilerKey: "a b" }).styleUrl, "https://api.maptiler.com/maps/basic-v2/style.json?key=a%20b");
  assert.equal(chooseBasemap({ provider: "OpenFreeMap", maptilerKey: "k" }).styleUrl, "https://tiles.openfreemap.org/styles/positron");
});

test("OpenFreeMap's style takes the Pins palette and keeps what it doesn't recognize", () => {
  const source = "openmaptiles";
  const style = { version: 8, center: [1, 2], zoom: 5, sources: { openmaptiles: { type: "vector" }, ne2_shaded: { type: "raster" } }, layers: [
    { id: "background", type: "background", paint: {} }, { id: "water", type: "fill", source, paint: {} }, { id: "highway_minor", type: "line", source, paint: {} },
    { id: "railway_transit", type: "line", source, paint: {} }, { id: "building", type: "fill", source, paint: {} }, { id: "label_city", type: "symbol", source, paint: {} }, { id: "brand_new", type: "line", source, paint: { "line-color": "#123" } },
  ] };
  const result = softenPositronStyle(style);
  const layer = id => result.layers.find(item => item.id === id);
  assert.equal(layer("background").paint["background-color"], "#EEEFE1");
  assert.equal(layer("water").paint["fill-color"], "#D4E5E7");
  assert.equal(layer("railway_transit").layout.visibility, "none");
  assert.equal(layer("building").minzoom, 14.5);
  assert.equal(layer("label_city").paint["text-halo-color"], "#EEEFE1");
  assert.equal(layer("brand_new").paint["line-color"], "#123");
  assert.equal(result.center, undefined, "No competing camera");
  assert.deepEqual(Object.keys(result.sources), ["openmaptiles"], "Unused sources are dropped");
  assert.throws(() => softenPositronStyle({ version: 8, sources: {}, layers: [] }));
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
    assert.match(headers["Content-Security-Policy"], /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/api\.maptiler\.com https:\/\/tiles\.openfreemap\.org;/, `Only these hosts: ${path}`);
    assert.match(headers["Strict-Transport-Security"], /max-age=\d{8}/, path);
    assert.match(headers["Permissions-Policy"], /geolocation=\(\)/, path);
  }
  for (const path of ["/@alan", "/@alan/", "/map/"]) {
    assert.equal(headersFor(path)["X-Robots-Tag"], "noindex, nofollow", path);
    assert.equal(headersFor(path)["Referrer-Policy"], "no-referrer", path);
  }
  assert.equal(headersFor("/vendor/maplibre-gl-worker-6.14.0.mjs")["Referrer-Policy"], "no-referrer", "Tile requests come from the worker, which has its own policy");
  assert.equal(headersFor("/")["X-Robots-Tag"], undefined, "The marketing site stays indexable");
  assert.equal(headersFor("/")["Referrer-Policy"], "strict-origin-when-cross-origin");
});

test("hidden characters are removed, and limits never cut an emoji in half", () => {
  const map = parsePublicMap(body({ profile: { username: "alan", display_name: "Al\u202Ean\u0007", bio: "line one\nline two", public_pin_count: 1 },
    pins: [pin({ title: "🍔".repeat(250), note: "a\u2066b\u0000c", category: { name: "Fo\u202Eod", icon: "\u0001🍔", color: "#FF8E3C" } })] }), "alan");
  assert.equal(map.displayName, "Alan");
  assert.equal(map.bio, "line one\nline two", "Line breaks stay");
  assert.equal(map.pins[0].title, "🍔".repeat(200), "The limit counts characters, like the database");
  assert.equal(map.pins[0].note, "abc");
  assert.deepEqual([map.pins[0].category.name, map.pins[0].category.icon], ["Food", "🍔"]);
  for (const link_url of ["https://exa\u0000mple.com", "https://example.com/\u202Egpj.exe", "java\u0001script:alert(1)"]) assert.equal(parsePublicMap(body({ pins: [pin({ link_url })] }), "alan").pins[0].linkUrl, null, link_url);
  assert.equal(parsePublicMap(body({ pins: [pin({ title: "\u202E\u0007" })] }), "alan").pins.length, 0, "A title of only hidden characters is no title");
});

test("a production build refuses missing settings, and any build refuses a secret in a public variable", () => {
  const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  const good = { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), NEXT_PUBLIC_MAP_PROVIDER: "openfreemap" };
  assert.deepEqual(problemsWith({ ...good, VERCEL_ENV: "production" }), []);
  assert.deepEqual(problemsWith({}), [], "Local builds and fixtures need nothing");
  assert.deepEqual(problemsWith({ VERCEL_ENV: "preview" }), [], "Other preview branches need nothing");
  assert.equal(problemsWith({ VERCEL_ENV: "production" }).length, 3);
  assert.equal(problemsWith({ ...good, VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.invalid" }).length, 1);
  assert.equal(problemsWith({ ...good, VERCEL_ENV: "production", NEXT_PUBLIC_MAP_PROVIDER: "" }).length, 1);
  for (const env of [{ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" }, { NEXT_PUBLIC_ANYTHING: jwt("service_role") }, { NEXT_PUBLIC_SERVICE_ROLE_KEY: "x" }]) {
    const problems = problemsWith(env);
    assert.equal(problems.length, 1, JSON.stringify(Object.keys(env)));
    for (const value of Object.values(env)) assert.ok(!problems[0].includes(value), "A problem never repeats the value");
  }
  assert.deepEqual(problemsWith({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key" }), [], "A fixture key is fine outside production");
  assert.equal(problemsWith({ ...good, VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key" }).length, 1);
});

test("the map's rewrites only ever catch /@username paths", () => {
  const { rewrites } = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const match = pathname => rewrites.some(({ source }) => new RegExp(`^${source.replace(/:\w+/g, "[^/]+")}$`).test(pathname));
  for (const path of ["/@alan", "/@alan/", "/@ALAN", "/@a.b_c"]) assert.ok(match(path), path);
  for (const path of ["/", "/privacy/", "/map/", "/@", "/@/", "/@alan/extra", "/foo@bar", "/alan", "/%40alan"]) assert.ok(!match(path), path);
  assert.ok(rewrites.every(({ destination }) => destination === "/map/"));
  // Whatever reaches the page, only a valid name asks the database for anything.
  for (const path of ["/@", "/map/", "/@%41lan", "/@alan%2Fbob", "/@a", "/@alan/extra", "/@" + "x".repeat(31), "/@al an", "/@<script>"]) assert.equal(usernameFromPath(path), null, path);
});
