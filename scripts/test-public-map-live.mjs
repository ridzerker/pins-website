import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

// LIVE browser check of /@username against production Supabase, for the disposable QA account
// created by the app repo's scripts/public-web-map-live-check.cjs (run only with the founder's
// approval). Build first with the real public values:
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build
//   PINS_LIVE_STATE=<app repo>/.cache/web-maps-live/state.json node scripts/test-public-map-live.mjs
// The server emulates vercel.json's rewrite. Requests may go only to this server and the Supabase
// RPC; anything else fails the run. The only write is the QA account turning its own map off and on.
const require = createRequire(import.meta.url);
const root = path.resolve("out");
const artifacts = path.resolve(".preview/public-map-live");
await fs.mkdir(artifacts, { recursive: true });
const state = JSON.parse(await fs.readFile(process.env.PINS_LIVE_STATE, "utf8"));
const qa = state.people.a;
const MARKER = "FORBIDDEN-WEBMAP-MARKER";
const shell = await fs.readFile(path.join(root, "map/index.html"), "utf8");
let supabase = null;
for (const chunk of (await fs.readdir(path.join(root, "_next/static/chunks"))).filter(name => name.endsWith(".js")))
  supabase ??= (await fs.readFile(path.join(root, "_next/static/chunks", chunk), "utf8")).match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
assert.ok(supabase, "The build has no Supabase URL: build with the real public values");
const RPC = `${supabase}/rest/v1/rpc/get_public_web_map`;
const anonKey = process.env.PINS_ANON_KEY;
assert.ok(anonKey, "PINS_ANON_KEY (the public anon key) is needed for the owner's sign-in");

// The QA owner toggles its own flag, exactly as the app does.
async function setOwnMap(enabled) {
  const auth = await fetch(`${supabase}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email: qa.email, password: qa.password }) });
  const { access_token: token } = await auth.json();
  assert.ok(token, "QA sign-in");
  const response = await fetch(`${supabase}/rest/v1/profiles?id=eq.${qa.id}&select=public_web_map_enabled`, { method: "PATCH",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ public_web_map_enabled: enabled }) });
  assert.deepEqual(await response.json(), [{ public_web_map_enabled: enabled }]);
}

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (/^\/@[^/]+\/?$/.test(url.pathname)) { res.setHeader("Content-Type", "text/html"); res.end(shell); return; }
    let filename = path.resolve(root, "." + decodeURIComponent(url.pathname));
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

const browser = await chromium.launch({ executablePath: process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ reducedMotion: "reduce" });
const blocked = new Set(), errors = [], rpc = [];
await context.route("**/*", route => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:") || url === RPC) return route.continue();
  blocked.add(url);
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("response", async response => {
  if (response.url() !== RPC || response.request().method() !== "POST") return;
  rpc.push({ status: response.status(), headers: await response.request().allHeaders(), body: await response.text().catch(() => "") });
});
const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const axe = async label => {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => `${v.id}: ${v.nodes.length}`));
  assert.deepEqual(violations, [], `Accessibility violations on ${label}`);
};
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
const list = () => page.locator("aside ul li");
const visible = ["QA Coit Tower", "QA Dolores Park", "QA Ferry Building", "QA Golden Gate Overlook"];

try {
  await setOwnMap(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/@${qa.username}`);
  await page.getByRole("heading", { name: "Web Map QA", level: 1 }).waitFor({ timeout: 20000 });
  assert.equal(await page.title(), `Web Map QA (@${qa.username}) | Pins`);
  for (const text of [`@${qa.username}`, "Test account for Pins web map QA. All pins are fictional.", "4 public pins"]) await page.getByText(text, { exact: true }).first().waitFor();
  await page.locator(".maplibregl-marker").first().waitFor({ timeout: 20000 });
  const titles = (await list().allInnerTexts()).map(text => visible.find(title => text.includes(title)) ?? text);
  assert.deepEqual(titles.sort(), visible, "Exactly the 4 public pins are listed");
  const html = await page.content();
  assert.ok(!html.includes(MARKER) && !html.includes("Hidden"), "No Only Me or Circle pin content in the page");
  const markers = await page.locator(".maplibregl-marker").count();
  const labelled = await page.locator(".maplibregl-marker[aria-label]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  assert.ok(markers >= 1 && labelled.every(label => visible.includes(label) || /\d/.test(label)), `Markers: ${JSON.stringify(labelled)}`);
  await page.screenshot({ path: path.join(artifacts, "live-1280.png"), fullPage: true });
  pass(`live map renders the QA profile and exactly its 4 public pins (${markers} map markers: ${labelled.join(", ")}); no hidden pin content in the DOM`);

  await page.locator("aside").getByRole("button", { name: /QA Ferry Building/ }).click();
  await page.getByRole("heading", { name: "QA Ferry Building", level: 2 }).waitFor();
  await page.getByText("Fictional QA pin: public only.").waitFor();
  assert.equal(await page.getByRole("link", { name: /Visit link/ }).getAttribute("href"), "https://example.com/pins-qa");
  assert.equal(await page.getByRole("link", { name: /Visit link/ }).getAttribute("rel"), "noopener noreferrer nofollow ugc");
  assert.match(await page.getByRole("link", { name: /Open in Maps/ }).getAttribute("href"), /query=37\.795500,-122\.393700$/);
  await page.getByRole("button", { name: "← All pins" }).click();
  await page.locator("aside").getByRole("button", { name: /QA Golden Gate Overlook/ }).click();
  await page.getByRole("heading", { name: "QA Golden Gate Overlook", level: 2 }).waitFor();
  assert.equal(await page.getByRole("link", { name: /Visit link/ }).count(), 0, "The javascript: link is not shown");
  await page.getByRole("button", { name: "← All pins" }).click();
  await page.locator("aside").getByRole("button", { name: /QA Coit Tower/ }).click();
  await page.getByText("Saved from another Pins member").waitFor();
  await page.getByRole("button", { name: "← All pins" }).click();
  const labelledMarker = page.locator(".maplibregl-marker[aria-label^='QA ']").first();
  if (await labelledMarker.count()) {
    const name = await labelledMarker.getAttribute("aria-label");
    await labelledMarker.click();
    await page.getByRole("heading", { name, level: 2 }).waitFor();
    await page.getByRole("button", { name: "← All pins" }).click();
  }
  pass("pin details show note, safe link and directions; the unsafe link is hidden; the saved copy is anonymously attributed; marker click opens details");

  const chips = page.getByRole("navigation", { name: "Filter by category" }).getByRole("button");
  const filters = (await chips.allInnerTexts()).map(text => text.replace(/\s+/g, " ").trim());
  assert.equal(filters[0], "All 4");
  const counts = filters.slice(1).map(text => Number(text.split(" ").at(-1)));
  assert.equal(counts.reduce((sum, n) => sum + n, 0), 4, "Category counts add up");
  const smallest = counts.indexOf(Math.min(...counts)) + 1;
  await chips.nth(smallest).click();
  assert.equal(await list().count(), counts[smallest - 1]);
  assert.equal(await chips.nth(smallest).getAttribute("aria-pressed"), "true");
  await chips.first().click();
  assert.equal(await list().count(), 4);
  pass(`category filters narrow the list and reset (${filters.join(" | ")})`);

  const call = rpc.at(-1);
  assert.equal(call.status, 200);
  assert.equal(call.headers.authorization, `Bearer ${anonKey}`, "Anon key only, no session");
  assert.equal(call.headers.cookie, undefined);
  assert.equal(call.headers.referer, undefined);
  assert.ok(!call.body.includes(MARKER) && !call.body.includes(qa.id));
  assert.deepEqual(await context.cookies(), []);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  pass("the live request is anonymous (anon key, no cookies, referrer or storage) and its raw response has no hidden content or ids");

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.getByRole("heading", { name: "Web Map QA", level: 1 }).waitFor({ timeout: 20000 });
    await page.locator(".maplibregl-canvas").waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    await axe(`live map at ${width}px`);
    await page.screenshot({ path: path.join(artifacts, `live-${width}.png`), fullPage: true });
  }
  pass("responsive at 320/390/768/1280 px with no overflow and no axe WCAG A/AA violations (live data)");

  for (const target of [`/@${qa.username.toUpperCase()}`, `/@${qa.username}/`]) {
    await page.goto(origin + target);
    await page.getByRole("heading", { name: "Web Map QA", level: 1 }).waitFor({ timeout: 20000 });
  }
  const unavailable = [];
  for (const target of [`/@${state.people.b.username}`, `/@${state.people.c.username}`, "/@webmap_qa_nobody", "/map/"]) {
    await page.goto(origin + target);
    await page.getByRole("heading", { name: "This map isn’t available.", level: 1 }).waitFor({ timeout: 20000 });
    unavailable.push(await page.locator("main").innerText());
  }
  assert.ok(unavailable.every(text => text === unavailable[0]), "Unknown, not-opted-in and private look identical");
  pass("routing: upper case and trailing slash work; not-opted-in, private, unknown and bare /map/ show the same unavailable page");

  await page.goto(`${origin}/@${qa.username}`);
  await page.getByRole("heading", { name: "Web Map QA", level: 1 }).waitFor({ timeout: 20000 });
  await setOwnMap(false);
  const started = Date.now();
  await page.reload();
  await page.getByRole("heading", { name: "This map isn’t available.", level: 1 }).waitFor({ timeout: 20000 });
  const revokedIn = Date.now() - started;
  assert.ok(!(await page.content()).includes("QA Ferry Building"), "Nothing survives the reload");
  await page.screenshot({ path: path.join(artifacts, "live-revoked-1280.png") });
  await setOwnMap(true);
  await page.reload();
  await page.getByRole("heading", { name: "Web Map QA", level: 1 }).waitFor({ timeout: 20000 });
  pass(`turning the map off in the account shows "not available" on the very next load (${revokedIn} ms reload); turning it on restores it`);

  assert.deepEqual(errors.filter(text => !/status of 404/.test(text)), [], "Browser errors");
  assert.deepEqual([...blocked], [], "Unexpected third-party requests");
  console.log(`${passed} live public map browser groups passed (production Supabase, disposable QA account; browser console clean; no other hosts contacted).`);
} catch (error) {
  console.log(`FAIL ${error.message}`);
  await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(artifacts, "failure.json"), JSON.stringify({ passedGroups: passed, message: error.message, stack: error.stack,
    url: page.url(), errors, blocked: [...blocked], rpcStatuses: rpc.map(call => call.status) }, null, 1));
  process.exitCode = 1;
} finally {
  // Automated testing always leaves the QA map off, pass or fail.
  try { await setOwnMap(false); console.log("End state: QA web map OFF."); } catch (error) { console.log(`FAIL could not turn the QA map off: ${error.message}`); process.exitCode = 1; }
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
