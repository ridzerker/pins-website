import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

// Measures /@username on the fixture build with synthetic maps of 0 to 2,000 pins. Only local requests
// and fixture data. Headless software rendering makes absolute times pessimistic, so compare runs of
// this script with each other, not with a phone.
//   NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build
//   node scripts/profile-public-map.mjs [sizes, comma separated]
const root = path.resolve("out");
const shell = await fs.readFile(path.join(root, "map/index.html"), "utf8");
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (/^\/@[^/]+\/?$/.test(pathname)) { res.setHeader("Content-Type", "text/html"); res.end(shell); return; }
    let file = path.join(root, decodeURIComponent(pathname));
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const categories = [{ name: "Food", icon: "🍔", color: "#FF8E3C" }, { name: "Hikes", icon: "⛰️", color: "#7BD389" }, { name: "Other", icon: "📍", color: "#6C63FF" }];
const mapOf = (n) => ({ truncated: false, profile: { username: `size${n}`, display_name: `Map of ${n}`, bio: null, public_pin_count: n }, pins: Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, title: `Place ${i}`, note: null, place_name: null, link_url: null, saved_from: null, category: categories[i % 3],
  // A deterministic scatter over one metro area, like a real person's map.
  latitude: 37.6 + ((i * 7919) % 1000) / 2500, longitude: -122.6 + ((i * 104729) % 1000) / 2000,
})) });

const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const sizes = (process.argv[2] ?? "0,1,10,100,300,301,1000,2000").split(",").map(Number);
const rows = [];
for (const n of sizes) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (!url.endsWith("/rpc/get_public_web_map")) return route.abort();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(mapOf(n)) });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const started = Date.now();
  await page.goto(`${origin}/@size${n}`);
  await page.getByRole("heading", { name: `Map of ${n}`, level: 1 }).waitFor();
  const row = { pins: n };
  if (n > 0) {
    await page.locator(".maplibregl-marker").first().waitFor({ timeout: 60000 });
    row.firstMarkerMs = Date.now() - started;
    await page.waitForTimeout(1500);
    row.markers = await page.locator(".maplibregl-marker").count();
    const box = await page.locator('[aria-label="Map of public pins"]').boundingBox();
    const before = await metrics();
    const startedPan = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 0; step < 40; step++) { await page.mouse.move(box.x + box.width / 2 + Math.sin(step / 3) * 120, box.y + box.height / 2 + Math.cos(step / 3) * 80); await page.waitForTimeout(16); }
    await page.mouse.up();
    const after = await metrics();
    const seconds = (Date.now() - startedPan) / 1000;
    row.panScriptMsPerS = Math.round((after.ScriptDuration - before.ScriptDuration) * 1000 / seconds);
    row.panLayoutMsPerS = Math.round(((after.LayoutDuration - before.LayoutDuration) + (after.RecalcStyleDuration - before.RecalcStyleDuration)) * 1000 / seconds);
    await page.waitForTimeout(500);
    const clickStarted = Date.now();
    await page.locator("aside").getByRole("button", { name: "Place 0", exact: true }).click();
    await page.getByRole("heading", { name: "Place 0", level: 2 }).waitFor();
    row.selectMs = Date.now() - clickStarted;
    await page.waitForTimeout(800);
  }
  const final = await metrics();
  row.domNodes = final.Nodes;
  row.heapMB = Math.round(final.JSHeapUsedSize / 1e5) / 10;
  rows.push(row);
  await context.close();
}
console.table(rows);
await browser.close();
server.close();
