import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { chromium } from "playwright-core";
import { CATEGORY_COLORS, MAP_OVERVIEW_PADDING, NEUTRAL_MAP_CENTER, getCategorySymbol, normalizeCategoryColor, overviewBounds, pinAppearance } from "../src/lib/pins-marker.ts";
import { softenBasicMapStyle } from "../src/lib/pins-map-style.ts";

// The Pins app is the visual source of truth. This renders the app's real components/PinsMarker.tsx
// through react-native-web, next to the website's marker on the built /@username page, and runs the
// app's real category and camera helpers against the website's copies. Nothing leaves this machine.
//   node --experimental-strip-types scripts/test-marker-parity.mjs   (after the fixture build in
//   scripts/test-public-map-e2e.mjs; needs the app repository beside this one, or PINS_APP_DIR)
// It is not an iOS render: native shadow and Apple emoji still need a device check.
const appRoot = path.resolve(process.env.PINS_APP_DIR || "../Pins");
if (!fs.existsSync(path.join(appRoot, "components/PinsMarker.tsx"))) { console.log(`SKIP: the Pins app is not at ${appRoot}`); process.exit(0); }
const appRequire = createRequire(path.join(appRoot, "package.json"));
const ts = appRequire("typescript"), React = appRequire("react"), RN = appRequire("react-native-web");
const { renderToStaticMarkup } = appRequire("react-dom/server");
const artifacts = path.resolve(".preview/marker-parity");
fs.mkdirSync(artifacts, { recursive: true });
const pass = message => console.log(`PASS ${message}`);

const mocks = { react: React, "react/jsx-runtime": appRequire("react/jsx-runtime"), "react-native": RN, "@/components/Avatar": { Avatar: () => null } };
const cache = new Map();
function load(request) {
  if (mocks[request]) return mocks[request];
  if (!request.startsWith("@/")) return appRequire(request);
  const base = path.join(appRoot, request.slice(2));
  const file = [".tsx", ".ts"].map(ext => base + ext).find(fs.existsSync);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInThisContext(`(function (module, exports, require, process, __DEV__) {${code}\n})`)(loaded, loaded.exports, load, process, false);
  return loaded.exports;
}
const { PinsMarker } = load("@/components/PinsMarker");
const palette = load("@/constants/designPalette");
const categories = load("@/constants/pinCategories");
const overview = load("@/lib/mapOverview");
const appStyle = load("@/lib/pinsMapStyle");

// --- Logic: the app's functions against the website's copies ------------------------------------
assert.deepEqual([...CATEGORY_COLORS], [...palette.CATEGORY_COLORS]);
const legacy = ["food", "drinks", "hikes", "shopping", "event", "other", "hangout", "study", "view", "custom", "constructor", null];
const colors = ["#8B5E3C", "#d9613c", "#7c5cc4", "#3F7D5A", "#000000", "#FFFFFF", "not-a-color", "", null, ...CATEGORY_COLORS];
for (const color of colors) for (const key of legacy) assert.equal(normalizeCategoryColor(color, key), palette.normalizeCategoryColor(color, key), `${color} / ${key}`);
for (const [name, icon] of [["Food", "🍔"], ["Coffee", null], ["  coffee", " "], ["", null], [null, null], ["éa", ""], ["Pin", "AB"]]) assert.equal(getCategorySymbol(name, icon), categories.getCategorySymbol(name, icon));
pass(`category colors and symbols match the app's functions across ${colors.length * legacy.length} color/key pairs`);

const seeds = [["Food", "🍔"], ["Food", "F"], ["Drinks", "🥤"], ["Hikes", "⛰️"], ["Shopping", "B"], ["Shopping", "🛍️"], ["Event", "E"], ["Other", "P"], ["Other", "📍"], ["Hangout", "H"], ["Study", "S"], ["View", "V"], ["Other", null]];
for (const [name, icon] of seeds) {
  const app = categories.categoryAsDisplay({ id: "x", user_id: "u", name, icon, color: "#000001", is_default: true, default_key: name.toLowerCase() });
  assert.deepEqual(pinAppearance({ name, icon, color: "#000001" }), { color: palette.normalizeCategoryColor(app.color, name.toLowerCase()), symbol: app.icon }, `${name} ${icon}`);
}
for (const name of ["Food", "Coffee", "Hikes"]) { // A pin whose category row is gone: the app's fixed fallback.
  const app = categories.fixedCategoryAsDisplay(name);
  assert.deepEqual(pinAppearance({ name, icon: null, color: null }), { color: palette.normalizeCategoryColor(app.color, name.toLowerCase()), symbol: app.icon }, name);
}
for (const [name, icon, color] of [["Coffee", "☕", "#8B5E3C"], ["Tacos", "🌮", "#FF6B6B"], ["Books", null, "#4D96FF"]]) {
  const app = categories.categoryAsDisplay({ id: "x", user_id: "u", name, icon, color, is_default: false, default_key: null });
  assert.deepEqual(pinAppearance({ name, icon, color }), { color: palette.normalizeCategoryColor(app.color, name.toLowerCase()), symbol: app.icon }, name);
}
pass("default, legacy-seed, custom and missing categories look the same as categoryAsDisplay and fixedCategoryAsDisplay");

const pts = (...pairs) => pairs.map(([latitude, longitude]) => ({ latitude, longitude }));
for (const points of [pts([37.8, -122.4], [37.75, -122.5]), pts([10, 179], [12, -179]), pts([0, 0], [0, 0], [1, 1]), pts([-33, 151], [51, 0], [40, -74])]) assert.deepEqual(overviewBounds(points), overview.overviewBounds(points));
assert.deepEqual(MAP_OVERVIEW_PADDING, overview.MAP_OVERVIEW_PADDING);
assert.deepEqual(NEUTRAL_MAP_CENTER, overview.NEUTRAL_MAP_CENTER);
pass("overview bounds (including the date line) and padding match the app");

const basic = { version: 8, sources: { maptiler_planet: { type: "vector" } }, center: [1, 2], zoom: 3, layers: ["Background:background", "Residential:fill", "Forest:fill", "Grass:fill", "Water:fill", "Building:fill", "River:line", "Road network:line", "Path:line", "Railway:line", "Road labels:symbol", "Place labels:symbol", "City labels:symbol"].map(entry => { const [id, type] = entry.split(":"); return { id, type, ...(type === "background" ? {} : { source: "maptiler_planet", "source-layer": "x" }), paint: {}, layout: {} }; }) };
assert.deepEqual(JSON.parse(JSON.stringify(softenBasicMapStyle(structuredClone(basic)))), JSON.parse(JSON.stringify(appStyle.softenBasicMapStyle(structuredClone(basic)))));
pass("the website's softened base map style is identical to the app's for the same MapTiler Basic input");

// --- Pixels: the app's marker against the website's marker ---------------------------------------
const samples = [
  { id: "food", name: "Food", icon: "🍔", color: "#FF8E3C", at: [38, -122] },
  { id: "drinks", name: "Drinks", icon: "🥤", color: "#2EC4B6", at: [38, -112] },
  { id: "hikes", name: "Hikes", icon: "⛰️", color: "#7BD389", at: [38, -102] },
  { id: "shopping", name: "Shopping", icon: "🛍️", color: "#F15BB5", at: [38, -92] },
  { id: "event", name: "Event", icon: "🎟️", color: "#4D96FF", at: [30, -122] },
  { id: "other", name: "Other", icon: "📍", color: "#6C63FF", at: [30, -112] },
  { id: "coffee", name: "Coffee", icon: "☕", color: "#8B5E3C", at: [30, -102] },
  { id: "letter", name: "Books", icon: null, color: "#4D96FF", at: [30, -92] },
];
const reference = (sample, selected) => renderToStaticMarkup(React.createElement("div", { "data-key": `${sample.id}${selected ? "-selected" : ""}`, style: { width: 50, height: 54, margin: 12, display: "inline-block" } },
  React.createElement(PinsMarker, { categoryName: sample.name, categoryIcon: categories.getCategorySymbol(sample.name, sample.icon), color: sample.color, selected })));
const referenceBody = samples.flatMap(sample => [reference(sample, false), reference(sample, true)]).join("");
const referenceHtml = `<!doctype html><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent} body{margin:0;background:#EEEFE1}</style>${referenceBody}`;

const root = path.resolve("out");
const shell = fs.readFileSync(path.join(root, "map/index.html"), "utf8");
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (/^\/@[^/]+\/?$/.test(pathname)) { res.setHeader("Content-Type", "text/html"); res.end(shell); return; }
  let file = path.join(root, decodeURIComponent(pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" }[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3, reducedMotion: "reduce" });
await context.route("**/*", route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  if (!url.endsWith("/rpc/get_public_web_map")) return route.abort();
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify({ truncated: false,
    profile: { username: "parity", display_name: "Parity", bio: null, public_pin_count: samples.length },
    pins: samples.map(sample => ({ id: sample.id, title: `Pin ${sample.id}`, note: null, place_name: null, link_url: null, latitude: sample.at[0], longitude: sample.at[1], saved_from: null, category: { name: sample.name, icon: sample.icon, color: sample.color } })) }) });
});
const site = await context.newPage();
const app = await context.newPage();
await app.setContent(referenceHtml);
const NO_SHADOW = "*{box-shadow:none!important}";
const shot = async (locator, shadows) => {
  const style = await locator.page().addStyleTag({ content: shadows ? "/* with shadows */" : NO_SHADOW });
  const box = await locator.boundingBox();
  // A layout offset of a fraction of a pixel must not change the screenshot's size.
  const buffer = await locator.page().screenshot({ clip: { x: box.x, y: box.y, width: 50, height: 54 } });
  await style.evaluate(node => node.remove());
  return buffer;
};
const measure = page => async (a, b) => page.evaluate(async ([first, second]) => {
  const image = async data => { const element = new Image(); element.src = `data:image/png;base64,${data}`; await element.decode(); const canvas = new OffscreenCanvas(element.width, element.height); const g = canvas.getContext("2d"); g.drawImage(element, 0, 0); return g.getImageData(0, 0, element.width, element.height); };
  const [x, y] = await Promise.all([image(first), image(second)]);
  if (x.width !== y.width || x.height !== y.height) return { size: `${x.width}x${x.height} vs ${y.width}x${y.height}`, ratio: 1 };
  // The page can lay the map out a fraction of a pixel off the grid, so allow one device pixel of shift and report it.
  const score = (dx, dy) => {
    let differing = 0, painted = 0;
    for (let row = 3; row < x.height - 3; row++) for (let col = 3; col < x.width - 3; col++) {
      const i = (row * x.width + col) * 4, j = ((row + dy) * x.width + col + dx) * 4;
      const delta = Math.max(Math.abs(x.data[i] - y.data[j]), Math.abs(x.data[i + 1] - y.data[j + 1]), Math.abs(x.data[i + 2] - y.data[j + 2]));
      if (delta > 40) differing++;
      if (Math.abs(x.data[i] - 238) + Math.abs(x.data[i + 1] - 239) + Math.abs(x.data[i + 2] - 225) > 12) painted++;
    }
    return { ratio: differing / Math.max(painted, 1), differing, painted, dx, dy };
  };
  let best = score(0, 0);
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { const next = score(dx, dy); if (next.ratio < best.ratio) best = next; }
  return best;
}, [a.toString("base64"), b.toString("base64")]);

const results = [];
const compare = measure(app);
const web = pinId => site.locator(`.maplibregl-marker[aria-label="Pin ${pinId}"]`);
const check = async (key, pinId) => {
  const left = app.locator(`[data-key="${key}"]`), right = web(pinId);
  const [a, b] = [await shot(left, false), await shot(right, false)];
  const result = await compare(a, b);
  fs.writeFileSync(path.join(artifacts, `${key}-app.png`), await shot(left, true));
  fs.writeFileSync(path.join(artifacts, `${key}-web.png`), await shot(right, true));
  results.push({ key, percent: +(result.ratio * 100).toFixed(2), shift: [result.dx, result.dy] });
  assert.ok(result.ratio < 0.02, `${key}: ${JSON.stringify(result)} differ from the app's marker`);
};
try {
  await site.goto(`${origin}/@parity`);
  await web("food").waitFor({ timeout: 30000 });
  await site.waitForTimeout(800);
  const clip = await site.locator(".maplibregl-map").evaluate(node => { node.style.background = "#EEEFE1"; return true; });
  assert.ok(clip);
  await site.locator('[class*="mapNote"]').evaluate(node => node.remove());
  for (const sample of samples) await check(sample.id, sample.id);
  pass(`every unselected category marker matches the app's PinsMarker pixel for pixel at 3x, shadows aside (worst ${Math.max(...results.map(r => r.percent))}%)`);
  const geometry = await web("food").evaluate(node => { const rect = node.getBoundingClientRect(); const body = node.children[1].getBoundingClientRect(); const center = node.children[1].firstElementChild.getBoundingClientRect(); return { frame: [rect.width, rect.height], bodyCenterY: body.y + body.height / 2 - rect.y, centerCenterY: center.y + center.height / 2 - rect.y }; });
  assert.deepEqual(geometry.frame, [50, 54], "Same frame as the app, so the same anchor");
  assert.ok(Math.abs(geometry.bodyCenterY - 25) < 0.01 && Math.abs(geometry.centerCenterY - 25) < 0.01, JSON.stringify(geometry));
  pass("the marker has the app's 50 x 54 frame and is anchored at its bottom center");
  for (const sample of samples) {
    await web(sample.id).click();
    await site.waitForTimeout(500);
    await web(sample.id).scrollIntoViewIfNeeded();
    await check(`${sample.id}-selected`, sample.id);
    assert.equal(await web(sample.id).getAttribute("aria-pressed"), "true");
    await site.getByRole("button", { name: "← All pins" }).click();
    await site.reload();
    await web("food").waitFor({ timeout: 30000 });
    await site.waitForTimeout(800);
    await site.locator('[class*="mapNote"]').evaluate(node => node.remove());
  }
  pass(`every selected marker (halo, thicker border, 1.08 scale) matches the app (worst ${Math.max(...results.map(r => r.percent))}%)`);
  fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  server.close();
}
