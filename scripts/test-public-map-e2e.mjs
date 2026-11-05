import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { headersFor } from "./lib/vercel-headers.mjs";

// Browser tests for joinpins.app/@username against the built static export, in an isolated headless
// browser. Build first with fixture values (never production):
//   NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build
// The server emulates vercel.json's /@:username -> /map/ rewrite. The Supabase RPC is answered by
// fixtures; every other off-site request is blocked and fails the run.
const require = createRequire(import.meta.url);
const root = path.resolve("out");
const artifacts = path.resolve(".preview/public-map");
await fs.mkdir(artifacts, { recursive: true });
const FIXTURE_ORIGIN = "https://fixture.supabase.invalid";
const RPC = `${FIXTURE_ORIGIN}/rest/v1/rpc/get_public_web_map`;
const shell = await fs.readFile(path.join(root, "map/index.html"), "utf8").catch(() => null);
assert.ok(shell, "out/map/index.html is missing: run the fixture build first");
const chunks = await fs.readdir(path.join(root, "_next/static/chunks")).catch(() => []);
let configured = false;
for (const chunk of chunks.filter(name => name.endsWith(".js"))) if ((await fs.readFile(path.join(root, "_next/static/chunks", chunk), "utf8")).includes(FIXTURE_ORIGIN)) configured = true;
assert.ok(configured, `The build is not using ${FIXTURE_ORIGIN}: rebuild with the fixture values above`);

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain" };
const served = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  served.push(url.pathname);
  // The fixture Supabase host stands in for the real one under the real policy.
  for (const [key, value] of Object.entries(headersFor(url.pathname))) res.setHeader(key, value.replace("https://*.supabase.co", `https://*.supabase.co ${FIXTURE_ORIGIN}`));
  try {
    // vercel.json rewrites: the URL stays /@username while the static shell is served.
    if (/^\/@[^/]+\/?$/.test(url.pathname)) { res.setHeader("Content-Type", "text/html"); res.end(shell); return; }
    // Vercel serves Next's prefetch files at dotted paths; the export writes them as folders.
    let filename = path.resolve(root, "." + decodeURIComponent(url.pathname).replace(/__next\.([^/]+)\.(__PAGE__\.txt)$/, "__next.$1/$2"));
    if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error("Invalid path");
    if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, "index.html");
    res.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream");
    res.end(await fs.readFile(filename));
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(await fs.readFile(path.join(root, "404.html")));
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// Fixtures: what the database function would return. null = unknown, private or disabled.
const pin = (id, title, lat, lng, category, extra = {}) => ({ id, title, note: null, place_name: null, link_url: null, latitude: lat, longitude: lng, category, saved_from: null, ...extra });
const food = { name: "Food", icon: "🍔", color: "#FF8E3C" }, coffee = { name: "Coffee", icon: "☕", color: "#8B5E3C" }, plain = { name: "Pin", icon: null, color: null };
const fixtures = {
  alan: { profile: { username: "alan", display_name: "Alan Tran", bio: "Tacos, coffee and long walks.", public_pin_count: 4 }, truncated: false, pins: [
    pin("p1", "Taco Spot", 34.05, -118.25, food, { note: "Best al pastor in town.", place_name: "Taco Spot, Los Angeles", link_url: "https://example.com/taco" }),
    pin("p2", "Morning Coffee", 34.07, -118.3, coffee, { saved_from: { username: "quinn", display_name: "Quinn" } }),
    pin("p3", "Hidden Bakery", 34.1, -118.2, food, { saved_from: { username: null, display_name: null } }),
    pin("p4", "<img src=x onerror=alert(1)>", 34.0, -118.4, plain),
  ] },
  long: { profile: { username: "long", display_name: "🌮 " + "Averyveryverylongdisplayname".repeat(4), bio: "Unbroken".repeat(40), public_pin_count: 1 }, truncated: false, pins: [
    pin("l1", "Title".repeat(40), 34.05, -118.25, { name: "Category".repeat(5), icon: "🌮🌯🥙", color: "#123456" }, { note: "Note ".repeat(300), place_name: "Place".repeat(40), link_url: "https://user:secret@example.com/" }),
  ] },
  "a.b_c": { profile: { username: "a.b_c", display_name: null, bio: null, public_pin_count: 1 }, truncated: false, pins: [pin("u1", "Dotted", 34.05, -118.25, food)] },
  newbie: { profile: { username: "newbie", display_name: null, bio: null, public_pin_count: 0 }, truncated: false, pins: [] },
  big: { profile: { username: "big", display_name: "Big Map", bio: null, public_pin_count: 2600 }, truncated: true,
    pins: Array.from({ length: 2000 }, (_, n) => pin(`b${n}`, `Place ${n}`, 20 + (n % 50) * 0.6, -120 + Math.floor(n / 50) * 0.9, n % 2 ? food : coffee)) },
};
let flakyFailures = 0;
const rpcCalls = [];
const answer = username => {
  if (username === "flaky" && flakyFailures-- > 0) return { status: 500, body: { message: "temporary" } };
  if (username === "flaky") return { status: 200, body: { ...fixtures.newbie, profile: { ...fixtures.newbie.profile, username: "flaky" } } };
  return { status: 200, body: fixtures[username] ?? null };
};

const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ reducedMotion: "reduce" });
const blocked = new Set(), errors = [], dialogs = [];
await context.route("**/*", async route => {
  const request = route.request();
  const url = request.url();
  if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
  if (url === RPC && request.method() === "POST") {
    const body = JSON.parse(request.postData() ?? "{}");
    const headers = await request.allHeaders();
    rpcCalls.push({ body, headers });
    const { status, body: response } = answer(body.target_username);
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(response), headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (url === RPC && request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST" } });
  blocked.add(url);
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
const consoleErrors = [];
page.on("console", message => { if (message.type() === "error" && !/status of 500/.test(message.text())) consoleErrors.push(`${message.text()} (${message.location().url})`); });
page.on("dialog", dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
const heading = () => page.getByRole("heading", { level: 1 }).textContent();
const axe = async label => {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => `${v.id}: ${v.nodes.length}`));
  assert.deepEqual(violations, [], `Accessibility violations on ${label}`);
};

try {
  const firstResponse = await page.goto(origin + "/@alan");
  assert.match(firstResponse.headers()["content-security-policy"], /default-src .self./, "The test server applies vercel.json, so the browser enforces the real policy");
  await page.getByRole("heading", { name: "Alan Tran", level: 1 }).waitFor();
  assert.equal(page.url(), origin + "/@alan", "The share URL stays in the address bar");
  assert.equal(await page.title(), "Alan Tran (@alan) | Pins");
  for (const text of ["@alan", "Tacos, coffee and long walks.", "4 public pins", "Already on Pins? Find @alan in Explore."]) await page.getByText(text, { exact: true }).first().waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
  assert.equal(await page.locator('meta[name="referrer"]').getAttribute("content"), "no-referrer");
  assert.equal(await page.locator('link[rel="canonical"]').count(), 0, "The shared shell never claims a canonical URL");
  pass("an opted-in map renders the profile at the share URL with a per-profile title, noindex and no-referrer");

  await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').waitFor({ timeout: 20000 });
  await page.locator(".maplibregl-marker", { hasText: "🍔" }).first().waitFor();
  await page.screenshot({ path: path.join(artifacts, "alan-1280.png"), fullPage: true });
  assert.equal(await page.locator(".maplibregl-marker").count(), 4, "Like the app, a small map draws every pin and never clusters");
  assert.equal(await page.locator('.maplibregl-marker[aria-label="<img src=x onerror=alert(1)>"]').innerText(), "P", "A category with no icon shows its first letter, like the app");
  assert.equal(await page.locator(".maplibregl-ctrl-compass").isVisible(), false, "The compass appears only once the map is rotated");
  const shape = await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').evaluate(element => { const body = element.children[1]; const style = getComputedStyle(body); return { width: element.offsetWidth, height: element.offsetHeight, transform: style.transform, tip: style.borderBottomLeftRadius, halo: getComputedStyle(element.children[0]).display }; });
  assert.deepEqual([shape.width, shape.height, shape.tip, shape.halo], [50, 54, "5px", "none"]);
  assert.ok(shape.transform.startsWith("matrix(0.707"), `The pin body is rotated so its tip points down (${shape.transform})`);
  await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').click();
  await page.getByRole("heading", { name: "Taco Spot", level: 2 }).waitFor();
  await page.getByText("Best al pastor in town.").waitFor();
  assert.equal(await page.getByRole("link", { name: /Visit link/ }).getAttribute("rel"), "noopener noreferrer nofollow ugc");
  assert.equal(await page.getByRole("link", { name: /Open in Maps/ }).getAttribute("href"), "https://www.google.com/maps/search/?api=1&query=34.050000,-118.250000");
  assert.equal(await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').evaluate(element => getComputedStyle(element.children[0]).display), "block", "A selected pin shows the app's halo");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "pin-title", "Opening details moves focus to them");
  await page.getByRole("button", { name: "← All pins" }).click();
  assert.ok((await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("Taco Spot"), "Closing details returns focus to that pin in the list");
  await page.locator("aside").getByRole("button", { name: /Taco Spot/ }).press("Enter");
  await page.getByRole("heading", { name: "Taco Spot", level: 2 }).press("Escape");
  await page.locator("aside").getByRole("button", { name: /Taco Spot/ }).waitFor();
  await page.locator("aside").getByRole("button", { name: /Morning Coffee/ }).click();
  assert.equal(await page.getByRole("link", { name: "Quinn" }).getAttribute("href"), "/@quinn");
  await page.getByRole("button", { name: "← All pins" }).click();
  await page.locator("aside").getByRole("button", { name: /Hidden Bakery/ }).click();
  await page.getByText("Saved from another Pins member").waitFor();
  await page.getByRole("button", { name: "← All pins" }).click();
  await page.locator("aside").getByRole("button", { name: "<img src=x onerror=alert(1)>" }).waitFor();
  assert.equal(await page.locator("img[src='x']").count(), 0, "Pin text is rendered as text");
  pass("markers and the list open pin details with safe links, attribution only for publishing creators, and escaped text");
  assert.deepEqual(consoleErrors, [], "No console errors or Content-Security-Policy violations on a working map");
  pass("a working map runs under the real security headers with no console errors");

  const markerCount = expected => page.waitForFunction(count => document.querySelectorAll(".maplibregl-marker").length === count, expected, { timeout: 15000 });
  // A keyboard user reaches a marker and opens it; a filter that hides the selected pin closes its details.
  await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Taco Spot", level: 2 }).waitFor();
  await page.getByRole("button", { name: /Coffee 1/ }).click();
  await page.getByRole("heading", { name: "Coffee", level: 2 }).waitFor();
  await markerCount(1);
  assert.equal(await page.locator('.maplibregl-marker[aria-pressed="true"]').count(), 0, "No stale selection after filtering");
  await page.getByRole("button", { name: /All 4/ }).click();
  await markerCount(4);
  await page.getByRole("button", { name: /Coffee 1/ }).click();
  assert.equal(await page.locator("aside").getByRole("button", { name: /Taco Spot/ }).count(), 0);
  await page.locator("aside").getByRole("button", { name: /Morning Coffee/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Coffee 1/ }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /All 4/ }).click();
  await page.locator("aside").getByRole("button", { name: /Taco Spot/ }).first().waitFor();
  pass("category filters narrow the map and list and can be cleared");

  const call = rpcCalls.find(item => item.body.target_username === "alan");
  assert.deepEqual(call.body, { target_username: "alan" }, "Only the username is sent");
  assert.equal(call.headers.apikey, "e2e-anon-key");
  assert.equal(call.headers.authorization, "Bearer e2e-anon-key", "No user session is ever sent");
  assert.equal(call.headers.cookie, undefined);
  assert.equal(call.headers.referer, undefined, "The page URL is not sent as a referrer");
  assert.deepEqual(await context.cookies(), []);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  pass("the data request is anonymous (anon key, no session, cookies, referrer or storage)");

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.getByRole("heading", { name: "Alan Tran", level: 1 }).waitFor();
    await page.locator(".maplibregl-canvas").waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    await axe(`/@alan at ${width}px`);
    await page.screenshot({ path: path.join(artifacts, `alan-${width}.png`), fullPage: true });
  }
  pass("responsive at 320/390/768/1280 px with no overflow and no axe WCAG A/AA violations");

  await page.goto(origin + "/@ALAN/");
  await page.getByRole("heading", { name: "Alan Tran", level: 1 }).waitFor();
  pass("usernames are case-insensitive and tolerate a trailing slash");

  const unavailable = [];
  for (const target of ["/@nobody", "/@private.person", "/@bad%20name", "/@al", "/map/"]) {
    await page.goto(origin + target);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForFunction(() => document.title === "Map not available | Pins", null, { timeout: 5000 }).catch(() => {});
    unavailable.push([await heading(), await page.locator("main").innerText(), await page.title()]);
  }
  // Deeper paths do not match the rewrite and get the site's ordinary 404.
  await page.goto(origin + "/@alan/extra");
  assert.equal(await heading(), "This place isn’t here.");
  assert.ok(unavailable.every(([title, text, docTitle]) => title === "This map isn’t available." && text === unavailable[0][1] && docTitle === "Map not available | Pins"),
    `Unavailable states must be identical: ${JSON.stringify(unavailable)}`);
  assert.ok(!rpcCalls.some(item => ["bad name", "al"].includes(item.body.target_username)), "Invalid usernames never reach the API");
  await axe("unavailable map");
  await page.screenshot({ path: path.join(artifacts, "unavailable-390.png"), fullPage: true });
  pass("unknown, private/disabled, malformed and missing usernames all show the same safe not-available page");

  fixtures.alan_revoked = fixtures.alan;
  await page.goto(origin + "/@alan");
  await page.getByRole("heading", { name: "Alan Tran", level: 1 }).waitFor();
  const alan = fixtures.alan;
  delete fixtures.alan;
  await page.reload();
  await page.getByRole("heading", { name: "This map isn’t available.", level: 1 }).waitFor();
  assert.ok(!(await page.content()).includes("Taco Spot"), "No cached pin data survives revocation");
  fixtures.alan = alan;
  pass("turning sharing off takes effect on the next load (no client-side cache of map data)");

  flakyFailures = 1;
  await page.goto(origin + "/@flaky");
  await page.getByRole("heading", { name: "We couldn’t load this map.", level: 1 }).waitFor();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("heading", { name: "@flaky", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "No public pins yet" }).waitFor();
  await page.goto(origin + "/@newbie");
  await page.getByRole("heading", { name: "No public pins yet" }).waitFor();
  await axe("empty map");
  pass("server errors offer a retry, and an empty published map explains itself");

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(origin + "/@long");
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.ok((await heading()).startsWith("🌮"));
    assert.equal(await page.locator('[class*="avatar"]').first().textContent(), "🌮A", "Initials keep a whole emoji");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(await overflow(), 0, `No sideways scroll with long text at ${width}`);
    await page.locator("aside").getByRole("button").first().click();
    await page.getByRole("heading", { level: 2, name: /^Title/ }).waitFor();
    assert.equal(await overflow(), 0, `No sideways scroll in long details at ${width}`);
    assert.equal(await page.getByRole("link", { name: /Visit link/ }).count(), 0, "A link hiding behind user:password@ is dropped");
    await axe(`long content at ${width}`);
  }
  await page.goto(origin + "/@a.b_c");
  await page.getByRole("heading", { name: "@a.b_c", level: 1 }).waitFor();
  pass("long names, bios, titles, notes and unusual usernames stay inside the layout, and credential-style links are dropped");

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(origin + "/@alan");
  await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').waitFor({ timeout: 20000 });
  await page.locator('.maplibregl-marker[aria-label="Taco Spot"]').click();
  await page.getByRole("heading", { name: "Taco Spot", level: 2 }).waitFor();
  assert.ok(await page.evaluate(() => { const box = document.getElementById("pin-title").getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), "On a phone, tapping a marker brings its details into view");
  pass("on a phone, tapping a marker scrolls its details into view");

  await page.setViewportSize({ width: 1280, height: 900 });
  const started = Date.now();
  await page.goto(origin + "/@big");
  await page.getByRole("heading", { name: "Big Map", level: 1 }).waitFor();
  await page.locator(".maplibregl-marker").first().waitFor({ timeout: 20000 });
  const elapsed = Date.now() - started;
  const domMarkers = await page.locator(".maplibregl-marker").count();
  assert.ok(domMarkers < 400, `Clustering keeps DOM markers bounded (${domMarkers})`);
  assert.equal(await page.locator("ul li").count(), 60, "The list renders progressively");
  await page.getByRole("button", { name: /Show more/ }).click();
  assert.equal(await page.locator("ul li").count(), 120);
  await page.getByText("Showing the newest 2,000 of 2,600 public pins.").waitFor();
  await page.screenshot({ path: path.join(artifacts, "big-1280.png") });
  await page.locator("aside").getByRole("button", { name: "Place 7", exact: true }).click();
  await page.locator('.maplibregl-marker[aria-label="Place 7"][aria-pressed="true"]').waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "← All pins" }).click();
  pass(`a 2,000-pin map clusters (${domMarkers} DOM markers), lists progressively and states truncation (${elapsed} ms to first marker, headless SwiftShader)`);

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  await noJs.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(origin + "/@alan");
  assert.ok(await noJsPage.locator("noscript").isVisible());
  assert.ok((await noJsPage.content()).includes("Turn on JavaScript to explore this map."));
  assert.ok(!(await noJsPage.content()).includes("Taco Spot"), "The static shell contains no user data");
  await noJs.close();
  pass("without JavaScript the shell explains itself and contains no user data");

  assert.deepEqual(dialogs, [], "No script injection");
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.deepEqual([...blocked], [], "Unexpected third-party requests");
  console.log(`${passed} public map browser groups passed (fixture data; no Supabase or MapTiler requests).`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
