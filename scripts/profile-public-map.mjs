import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { serveExport } from "./lib/static-server.mjs";

// Benchmarks /@username on a fixture build with deterministic synthetic maps. Only local requests and
// fixture data. Each size runs in a fresh browser context, and results are medians with their range.
// Headless software rendering makes absolute times pessimistic, so compare runs of this script with
// each other, never with a phone.
//   NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build
//   npm run profile:public-map -- --sizes=10,100,300,500,1000,2000 --runs=5 [--root=out] [--json=results.json]
const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const sizes = option("sizes", "10,100,300,500,1000,2000").split(",").map(Number);
const runs = Number(option("runs", "5"));
const site = await serveExport({ root: path.resolve(option("root", "out")), csp: value => value.replace("https://*.supabase.co", "https://*.supabase.co https://fixture.supabase.invalid") });
const { origin } = site;

const categories = [{ name: "Food", icon: "🍔", color: "#FF8E3C" }, { name: "Hikes", icon: "⛰️", color: "#7BD389" }, { name: "Other", icon: "📍", color: "#6C63FF" }];
const mapOf = n => ({ truncated: false, profile: { username: `size${n}`, display_name: `Map of ${n}`, bio: null, public_pin_count: n }, pins: Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, title: `Place ${i}`, note: null, place_name: null, link_url: null, saved_from: null, category: categories[i % 3],
  // A deterministic scatter over one metro area, like a real person's map.
  latitude: 37.6 + ((i * 7919) % 1000) / 2500, longitude: -122.6 + ((i * 104729) % 1000) / 2000,
})) });

const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"] });

async function measure(n) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
    if (!url.endsWith("/rpc/get_public_web_map")) return route.abort();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(mapOf(n)) });
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__long = 0;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__long += entry.duration; }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const settled = async () => { await page.waitForTimeout(500); };
  const markers = page.locator(".maplibregl-marker");
  const started = Date.now();
  await page.goto(`${origin}/@size${n}`);
  await markers.first().waitFor({ timeout: 60000 });
  const row = { firstMarkerMs: Date.now() - started };
  await page.waitForTimeout(1500);
  row.markers = await markers.count();
  row.loadLongTaskMs = Math.round(await page.evaluate(() => window.__long));

  // Timed interactions. Each reports main-thread script per second, and long tasks in the interaction.
  const during = async action => {
    const before = await metrics(), long = await page.evaluate(() => window.__long), at = Date.now();
    await action();
    const after = await metrics(), seconds = (Date.now() - at) / 1000;
    return { script: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000 / seconds), layout: Math.round(((after.LayoutDuration - before.LayoutDuration) + (after.RecalcStyleDuration - before.RecalcStyleDuration)) * 1000 / seconds), long: Math.round(await page.evaluate(() => window.__long) - long) };
  };
  const box = await page.locator('[aria-label="Map of public pins"]').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  const pan = await during(async () => {
    await page.mouse.down();
    for (let step = 0; step < 40; step++) { await page.mouse.move(cx + Math.sin(step / 3) * 120, cy + Math.cos(step / 3) * 80); await page.waitForTimeout(16); }
    await page.mouse.up();
  });
  Object.assign(row, { panScriptMsPerS: pan.script, panLayoutMsPerS: pan.layout, panLongTaskMs: pan.long });
  await settled();
  const zoom = await during(async () => { for (let step = 0; step < 6; step++) { await page.mouse.wheel(0, step < 3 ? -240 : 240); await page.waitForTimeout(120); } await settled(); });
  Object.assign(row, { zoomScriptMsPerS: zoom.script, zoomLongTaskMs: zoom.long });

  const filterStart = Date.now();
  await page.getByRole("button", { name: /^.*Food \d/ }).click();
  await page.getByRole("heading", { name: "Food", level: 2 }).waitFor();
  row.filterListMs = Date.now() - filterStart;
  await markers.first().waitFor({ timeout: 30000 });
  row.filterMarkerMs = Date.now() - filterStart;
  await page.getByRole("button", { name: /^All \d/ }).click();
  await markers.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);

  const selectStart = Date.now();
  await page.locator("aside").getByRole("button", { name: "Place 0", exact: true }).click();
  await page.getByRole("heading", { name: "Place 0", level: 2 }).waitFor();
  row.selectMs = Date.now() - selectStart;
  // 10,000 means the selected marker never appeared, for example hidden in a cluster.
  row.selectMarkerMs = await page.locator('.maplibregl-marker[aria-label="Place 0"][aria-pressed="true"]').waitFor({ timeout: 10000 }).then(() => Date.now() - selectStart, () => 10000);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.gc?.());
  const final = await metrics();
  row.domNodes = final.Nodes;
  row.heapMB = Math.round(final.JSHeapUsedSize / 1e5) / 10;
  await context.close();
  return row;
}

const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const results = {};
for (const n of sizes) {
  const samples = [];
  for (let run = 0; run < runs; run++) samples.push(await measure(n));
  results[n] = Object.fromEntries(Object.keys(samples[0]).map(key => { const values = samples.map(sample => sample[key]); return [key, { median: median(values), min: Math.min(...values), max: Math.max(...values) }]; }));
  console.log(`${n} pins (median of ${runs}, [min-max])`);
  for (const [key, { median: mid, min, max }] of Object.entries(results[n])) console.log(`  ${key.padEnd(18)} ${String(mid).padStart(8)}  [${min}-${max}]`);
}
const json = option("json", null);
if (json) await fs.writeFile(json, JSON.stringify({ runs, results }, null, 2));
await browser.close();
await site.close();
