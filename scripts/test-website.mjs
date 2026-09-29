import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

// Test the built static export with an isolated headless browser, never a user profile.
const require = createRequire(import.meta.url);
const root = path.resolve("out");
const artifacts = path.resolve(".preview/sprint");
await fs.mkdir(artifacts, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml" };
const server = createServer(async (req, res) => {
  let filename;
  try {
    const url = new URL(req.url, "http://localhost");
    filename = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error("Invalid path");
    if ((await fs.stat(filename)).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(308, { Location: url.pathname + "/" + url.search }); res.end(); return;
      }
      filename = path.join(filename, "index.html");
    }
    res.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream");
    res.end(await fs.readFile(filename));
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(await fs.readFile(path.join(root, "404.html")));
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browserPath = process.env.PINS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const context = await browser.newContext({ reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const externalRequests = new Set();
page.on("request", request => { if (!request.url().startsWith(origin) && !request.url().startsWith("data:")) externalRequests.add(request.url()); });
const report = { routes: [], links: [], confirmations: [], externalRequests: [], errors: [], screenshots: [] };
const routes = ["/", "/privacy/", "/terms/", "/cookies/", "/data-request/", "/support/", "/delete-account/", "/auth/confirmed/", "/missing-page/"];
const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");

try {
  for (const route of routes) {
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(origin + route);
      assert.equal(response.status(), route === "/missing-page/" ? 404 : 200, route);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        h1: document.querySelectorAll("h1").length,
        main: document.querySelectorAll("main").length,
        font: getComputedStyle(document.body).fontFamily,
        local: localStorage.length, session: sessionStorage.length,
        imagesWithoutAlt: document.querySelectorAll("img:not([alt])").length,
        missingTargets: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash),
      }));
      assert.ok(layout.scroll <= width, `${route} overflows at ${width}: ${layout.scroll}`);
      assert.equal(layout.h1, 1, `${route} h1`);
      assert.equal(layout.main, 1, `${route} main`);
      assert.match(layout.font, /inter/i);
      assert.equal(layout.local + layout.session, 0, "Unexpected browser storage");
      assert.equal(layout.imagesWithoutAlt, 0);
      assert.deepEqual(layout.missingTargets, []);
      await page.addScriptTag({ content: axeSource });
      const accessibility = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ html: n.html, summary: n.failureSummary })) }));
      });
      report.routes.push({ route, width, ...layout, violations: accessibility });
      // Collect all violations before failing, so repairs can address the whole site.
      if ([390, 1440].includes(width)) {
        const name = `${route.replaceAll("/", "_") || "home"}-${width}.png`;
        await page.screenshot({ path: path.join(artifacts, name), fullPage: true });
        report.screenshots.push(name);
        if (width === 390) await page.screenshot({ path: path.join(artifacts, name.replace(".png", "-top.png")) });
      }
    }
    console.log(`Responsive and accessibility scan: ${route}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + route);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows with 200% text`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto", "Reduced-motion scrolling");
    // Exercise each rendered link with the keyboard, including footer and on-page anchors.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + route);
    const links = await page.locator("a").evaluateAll(nodes => nodes.map(a => ({ href: a.getAttribute("href"), name: a.getAttribute("aria-label") || a.textContent.trim() })));
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      assert.ok(link.href && link.href !== "#", `Empty link at ${route}`);
      if (link.href.startsWith("mailto:")) {
        const email = new URL(link.href);
        assert.match(email.pathname, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        assert.ok(!email.searchParams.has("body"), "Do not prefill private user data");
        report.links.push({ route, ...link, result: "Mail destination syntax checked; no message sent or delivery verified" });
        continue;
      }
      assert.ok(!/^(javascript:|https?:)/i.test(link.href), `Unexpected external link: ${link.href}`);
      await page.goto(origin + route);
      const target = page.locator("a").nth(i);
      await target.focus();
      assert.ok(await target.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none"), `Focus missing: ${route} ${link.name}`);
      await target.press("Enter");
      const expected = new URL(link.href, origin + route);
      await page.waitForURL(url => url.pathname.replace(/\/$/, "") === expected.pathname.replace(/\/$/, "") && url.hash === expected.hash, { timeout: 5000 }).catch(error => { throw new Error(`${route}: ${link.name} (${link.href}) navigated to ${page.url()}`, { cause: error }); });
      if (expected.hash) assert.equal(await page.locator(expected.hash).count(), 1);
      else assert.equal((await context.request.get(expected.href)).status(), 200);
      report.links.push({ route, ...link, result: "Keyboard activation passed" });
    }
    await page.goto(origin + route);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Skip to content");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "main-content");
    // Traverse every remaining focusable link, checking visible keyboard focus and no trap.
    const seen = new Set();
    for (let i = 0; i < links.length + 2; i++) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim(), focus: document.activeElement.matches(":focus-visible"), outline: getComputedStyle(document.activeElement).outlineStyle }));
      if (state.tag === "A") { assert.ok(state.focus && state.outline !== "none"); seen.add(state.text); }
    }
    assert.ok(seen.size > 4, `Keyboard navigation stalled on ${route}`);
  }

  for (const [suffix, expected] of [
    ["", "Return to Pins"],
    ["#error=access_denied&error_code=otp_expired", "This link has expired"],
    ["?error_code=invalid_token", "This link has expired"],
    ["?error=server_error", "We couldn’t confirm your email"],
    ["?token_hash=TEST_ONLY&type=email", "We couldn’t confirm your email"],
    ["#access_token=TEST_ONLY&refresh_token=TEST_ONLY&type=signup", "Return to Pins"],
  ]) {
    await page.goto(origin + "/auth/confirmed/" + suffix);
    await page.getByRole("heading", { name: expected, exact: true }).waitFor();
    assert.ok(!page.url().includes("TEST_ONLY"));
    await page.reload();
    await page.getByRole("heading", { name: expected, exact: true }).waitFor();
    report.confirmations.push({ suffix, expected, result: "Passed after hydration and reload" });
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(origin + "/privacy/");
  assert.equal(await noJsPage.getByRole("heading", { level: 1 }).textContent(), "Your information, explained.");
  await noJsPage.goto(origin + "/auth/confirmed/");
  assert.ok(await noJsPage.locator("noscript").isVisible());
  await noJs.close();
  assert.deepEqual(await context.cookies(), [], "Unexpected cookies");
  assert.deepEqual([...externalRequests], [], "Unexpected third-party requests");
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.deepEqual(report.routes.filter(r => r.violations.length).map(r => ({route:r.route,width:r.width,violations:r.violations})), [], "Accessibility violations");
  console.log(`PASS: ${report.routes.length} responsive/axe scans, ${report.links.length} links, ${report.confirmations.length} confirmation cases, no-JS, cookies and network checks.`);
} finally {
  report.externalRequests = [...externalRequests]; report.errors = errors;
  await fs.writeFile(path.join(artifacts, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
