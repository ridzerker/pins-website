import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { headersFor } from "./vercel-headers.mjs";

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain" };

/** Serves the static export like Vercel: the /@username rewrite and vercel.json's headers. `csp` adjusts the policy under test. */
export async function serveExport({ root = path.resolve("out"), csp = value => value } = {}) {
  const shell = await fs.readFile(path.join(root, "map/index.html"), "utf8");
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    for (const [key, value] of Object.entries(headersFor(pathname))) res.setHeader(key, key === "Content-Security-Policy" ? csp(value) : value);
    try {
      if (/^\/@[^/]+\/?$/.test(pathname)) { res.setHeader("Content-Type", "text/html"); res.end(shell); return; }
      let file = path.resolve(root, "." + decodeURIComponent(pathname).replace(/__next\.([^/]+)\.(__PAGE__\.txt)$/, "__next.$1/$2"));
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error("Invalid path");
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
      res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
