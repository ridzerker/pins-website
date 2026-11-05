import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Runs after `next build`. A static export can't use nonces, so vercel.json's policy has to allow
// inline scripts on every page. Each page's own inline scripts are fixed at build time, though, so
// this pins them: it adds a <meta> policy listing their hashes. Browsers enforce both policies, so an
// injected inline script is blocked even though the header allows inline. If this step ever doesn't
// run, the pages simply fall back to the header policy.
const root = path.resolve(process.argv[2] ?? "out");
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const NOT_EXECUTED = /\btype=["'](?:application\/(?:ld\+)?json)["']/i;

const walk = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
let pages = 0;
for (const file of (await walk(root)).filter(name => name.endsWith(".html"))) {
  const html = await fs.readFile(file, "utf8");
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const hashes = new Set();
  for (const [, attributes, body] of html.matchAll(INLINE_SCRIPT)) if (!NOT_EXECUTED.test(attributes)) hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  const meta = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' ${[...hashes].join(" ")}"/>`;
  if (!/<head[^>]*>/i.test(html)) throw new Error(`No <head> in ${file}`);
  // First in <head>: a policy only covers what comes after it.
  await fs.writeFile(file, html.replace(/<head[^>]*>/i, match => match + meta));
  pages++;
}
if (!pages) throw new Error(`No pages found under ${root}`);
console.log(`Pinned inline scripts on ${pages} pages.`);
