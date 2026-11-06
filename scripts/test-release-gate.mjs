import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

// Checks what a build actually produced in out/, because that is what visitors receive. Run after a build.
const root = path.resolve("out");
const walk = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
const files = await walk(root);
const pages = files.filter(file => file.endsWith(".html"));
const readable = files.filter(file => /\.(html|js|mjs|css|txt|json|xml|map)$/.test(file));
const contents = await Promise.all(readable.map(async file => [path.relative(root, file), await fs.readFile(file, "utf8")]));
const shell = await fs.readFile(path.join(root, "map/index.html"), "utf8");
const meta = (html, name) => new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`).exec(html)?.[1] ?? null;

test("every page starts with a policy listing exactly its own inline scripts", () => {
  assert.ok(pages.length >= 10, `Found ${pages.length} pages`);
  const INLINE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  return Promise.all(pages.map(async file => {
    const html = await fs.readFile(file, "utf8");
    const policy = /<head[^>]*><meta http-equiv="Content-Security-Policy" content="([^"]+)"\/>/.exec(html);
    assert.ok(policy, `${file}: the policy must come first in <head>`);
    assert.doesNotMatch(policy[1], /unsafe/, file);
    const listed = new Set(policy[1].match(/'sha256-[^']+'/g) ?? []);
    const actual = new Set([...html.matchAll(INLINE)].filter(([, attributes]) => !/type=["']application\/(?:ld\+)?json["']/i.test(attributes))
      .map(([, , body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`));
    assert.deepEqual([...actual].sort(), [...listed].sort(), file);
  }));
});

test("no privileged credential or test account reaches a visitor", () => {
  const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;
  for (const [name, text] of contents) {
    for (const [, payload] of text.matchAll(JWT)) assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).role, "anon", `${name}: a token that isn't the public key`);
    assert.doesNotMatch(text, /sb_secret_|service_role|SUPABASE_SERVICE/i, name);
    assert.doesNotMatch(text, /webmap_qa_|FORBIDDEN-WEBMAP/, name);
  }
});

test("no analytics, tracker or unexpected third party is built in", () => {
  for (const [name, text] of contents) if (!name.startsWith("vendor")) {
    assert.doesNotMatch(text, /googletagmanager|google-analytics|gtag\(|segment\.io|hotjar|mixpanel|facebook\.net|plausible\.io|sentry\.io|\/_vercel\/insights|va\.vercel-scripts/i, name);
  }
});

test("the map shell is generic, unindexed and holds no user data", () => {
  assert.equal(meta(shell, "robots"), "noindex, nofollow");
  assert.equal(meta(shell, "referrer"), "no-referrer");
  assert.equal(meta(shell, "og:title"), "Explore this map on Pins");
  assert.equal(meta(shell, "twitter:title"), "Explore this map on Pins");
  assert.equal(meta(shell, "og:url"), null, "One shell serves every username, so it can't name a URL");
  assert.doesNotMatch(shell, /rel="canonical"/, "Nor a canonical address");
  assert.match(meta(shell, "og:image") ?? "", /^https:\/\/www\.joinpins\.app\/og-image\.png$/);
  assert.match(meta(shell, "twitter:image") ?? "", /^https:\/\/www\.joinpins\.app\/og-image\.png$/);
  assert.ok(files.includes(path.join(root, "og-image.png")), "The preview image ships with the site");
  assert.doesNotMatch(shell, /"(?:latitude|longitude|public_pin_count)"/);
});

test("maps stay out of the sitemap, and crawlers can still read the noindex", async () => {
  const sitemap = await fs.readFile(path.join(root, "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /\/map\/|\/@/);
  assert.doesNotMatch(await fs.readFile(path.join(root, "robots.txt"), "utf8"), /Disallow:\s*\/\s*$/m);
});

test("the map's code stores nothing in the browser and logs nothing", async () => {
  for (const file of ["src/components/public-map/public-map-app.tsx", "src/components/public-map/map-canvas.tsx", "src/lib/public-map.ts", "src/lib/map-provider.ts", "src/lib/pins-marker.ts"]) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.(log|info|debug|warn|error)/, file);
  }
});
