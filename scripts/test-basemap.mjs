import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { serveExport } from "./lib/static-server.mjs";

// The optional base map, on a build made with NEXT_PUBLIC_MAP_PROVIDER=openfreemap and the fixture
// Supabase values. Normally every provider response is a local fixture, so no request leaves this PC.
//   node scripts/test-basemap.mjs         Fixture provider, all failure paths
//   node scripts/test-basemap.mjs --live  One real look at OpenFreeMap, with screenshots in .preview/basemap
const LIVE = process.argv.includes("--live");
const TILES = "https://tiles.openfreemap.org";
const SUPABASE = "https://fixture.supabase.invalid";
const artifacts = path.resolve(".preview/basemap");
await fs.mkdir(artifacts, { recursive: true });
const allowed = value => value.replace("https://*.supabase.co", `https://*.supabase.co ${SUPABASE}`);
const notAllowed = value => allowed(value).replace(` ${TILES}`, "");
const withProvider = await serveExport({ csp: allowed });
const withoutCsp = await serveExport({ csp: notAllowed });

const food = { name: "Food", icon: "🍔", color: "#FF8E3C" }, coffee = { name: "Coffee", icon: "☕", color: "#C77D52" };
const places = [["Ferry Building", 37.7955, -122.3937, food], ["Tartine", 37.7614, -122.4241, coffee], ["Golden Gate Park", 37.7694, -122.4862, food], ["Coit Tower", 37.8024, -122.4058, coffee]];
const alan = { truncated: false, profile: { username: "alan", display_name: "Alan Tran", bio: null, public_pin_count: places.length },
  pins: places.map(([title, latitude, longitude, category], n) => ({ id: `p${n}`, title, note: null, place_name: null, link_url: null, saved_from: null, latitude, longitude, category })) };
const style = { version: 8, center: [0, 0], zoom: 9, sources: { ne2_shaded: { type: "raster", tiles: [`${TILES}/n/{z}/{x}/{y}.png`], tileSize: 256 }, openmaptiles: { type: "vector", url: `${TILES}/planet` } }, glyphs: `${TILES}/fonts/{fontstack}/{range}.pbf`, sprite: `${TILES}/sprites/ofm`,
  layers: [{ id: "background", type: "background", paint: { "background-color": "#000" } }, { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#000" } }, { id: "highway_minor", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#000" } }] };
const tilejson = { tilejson: "3.0.0", tiles: [`${TILES}/planet/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14, attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" };
const CORS = { "access-control-allow-origin": "*" };

const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

/** Opens /@alan. `provider` answers tile-host requests with fixtures; without it they go out for real. */
async function open(site, provider, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const tileRequests = [], cspErrors = [], otherHosts = new Set();
  await context.route("**/*", async route => {
    const request = route.request(), url = request.url();
    if (url.startsWith(site.origin) || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
    if (url.endsWith("/rpc/get_public_web_map")) {
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*" } });
      return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(alan) });
    }
    if (url.startsWith(TILES)) {
      tileRequests.push({ url, headers: await request.allHeaders() });
      return provider ? route.fulfill(provider(url)) : route.continue();
    }
    otherHosts.add(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("console", message => { if (/Content.Security.Policy/i.test(message.text())) cspErrors.push(message.text()); });
  await page.goto(`${site.origin}/@alan`);
  await page.locator('.maplibregl-marker[aria-label="Tartine"]').waitFor({ timeout: 30000 });
  return { page, context, tileRequests, cspErrors, otherHosts };
}
const json = (body, status = 200) => ({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
const working = url => url.endsWith("/styles/positron") ? json(style) : url.endsWith("/planet") ? json(tilejson) : { status: 204, headers: CORS };
const NOTE = "Map background unavailable", BROKEN = "The map couldn’t load. You can still browse the pins in the list.";

try {
  if (LIVE) {
    for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 780 }]]) {
      const { page, context, tileRequests, cspErrors, otherHosts } = await open(withProvider, null, viewport);
      await page.waitForTimeout(6000);
      const hosts = new Set(tileRequests.map(({ url }) => new URL(url).host));
      await page.screenshot({ path: path.join(artifacts, `live-${name}.png`) });
      // Rough responsiveness at 4x CPU slowdown. Software rendering, so this is pessimistic and not a phone.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const box = await page.locator('[aria-label="Map of public pins"]').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.evaluate(() => { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const before = await page.evaluate(() => window.__frames), startedAt = Date.now();
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let step = 0; step < 30; step++) { await page.mouse.move(cx + Math.sin(step / 3) * 80, cy + Math.cos(step / 3) * 60); await page.waitForTimeout(16); }
      await page.mouse.up();
      await page.mouse.wheel(0, -300); await page.waitForTimeout(800); await page.mouse.wheel(0, 300); await page.waitForTimeout(800);
      const fps = Math.round((await page.evaluate(() => window.__frames) - before) * 1000 / (Date.now() - startedAt));
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await page.waitForTimeout(1500);
      console.log(name, "after pan and zoom at 4x slowdown:", { fps, markers: await page.locator(".maplibregl-marker").count() });
      await page.locator('.maplibregl-marker[aria-label="Tartine"]').click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(artifacts, `live-${name}-selected.png`) });
      await page.screenshot({ path: path.join(artifacts, `live-${name}-final.png`) });
      console.log(name, { tileRequests: tileRequests.length, hosts: [...hosts], cspErrors, otherHosts: [...otherHosts], referer: tileRequests.filter(({ headers }) => headers.referer).length, note: await page.getByText(NOTE).count(), attribution: await page.locator(".maplibregl-ctrl-attrib").innerText() });
      await context.close();
    }
  } else {
    {
      const { page, context, tileRequests, cspErrors, otherHosts } = await open(withProvider, working);
      await page.locator(".maplibregl-ctrl-attrib", { hasText: "OpenStreetMap" }).waitFor();
      const box = await page.locator('[aria-label="Map of public pins"]').boundingBox();
      await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 }); await page.mouse.up();
      await page.waitForTimeout(400);
      assert.ok(await page.locator(".maplibregl-ctrl-attrib", { hasText: "OpenFreeMap" }).isVisible(), "The credit stays visible after dragging");
      assert.equal(await page.getByText(NOTE).count(), 0, "A working base map shows no notice");
      assert.ok(tileRequests.some(({ url }) => url.endsWith("/styles/positron")));
      assert.ok(tileRequests.every(({ url }) => !/key=/.test(url)), "No key is sent");
      assert.deepEqual(tileRequests.filter(({ headers }) => headers.referer || headers.cookie).map(({ url, headers }) => [url, headers.referer]), [], "The username never reaches the provider as a referrer");
      assert.equal(tileRequests.filter(({ url }) => url.includes("/n/")).length, 0, "The unused shaded-relief source is not loaded");
      assert.deepEqual(cspErrors, []);
      assert.deepEqual([...otherHosts], []);
      await context.close();
      console.log("PASS a configured provider loads with attribution, no key, no referrer and no policy violations");
    }
    for (const [label, provider, site] of [
      ["its style fails", () => json({ message: "down" }, 500), withProvider],
      ["its style is not the expected one", () => json({ version: 8, sources: {}, layers: [] }), withProvider],
      ["its tiles fail", url => url.endsWith("/styles/positron") ? json(style) : json({ message: "down" }, 503), withProvider],
      ["the security policy doesn't allow it yet", working, withoutCsp],
    ]) {
      const { page, context } = await open(site, provider);
      await page.getByText(NOTE).waitFor({ timeout: 15000 });
      assert.equal(await page.getByText(BROKEN).count(), 0, label);
      assert.equal(await page.locator(".maplibregl-marker").count(), places.length, label);
      await page.locator('.maplibregl-marker[aria-label="Tartine"]').click();
      await page.getByRole("heading", { name: "Tartine", level: 2 }).waitFor();
      await context.close();
      console.log(`PASS when ${label}, pins still work on the plain background with the notice`);
    }
  }
} finally {
  await browser.close();
  await withProvider.close();
  await withoutCsp.close();
}
