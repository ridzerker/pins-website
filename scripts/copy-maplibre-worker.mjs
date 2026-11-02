// MapLibre GL v6 loads its worker from a URL computed at runtime, which bundlers cannot see.
// Copy the pinned worker next to the site (public/vendor is gitignored) before dev and build.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("maplibre-gl/package.json");
const expected = "6.14.0"; // Must match MAPLIBRE_WORKER_URL in src/components/public-map/map-canvas.tsx.
if (version !== expected) throw new Error(`maplibre-gl ${version} installed; update MAPLIBRE_WORKER_URL and this script for ${expected}.`);
const source = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs");
const target = path.resolve("public/vendor", `maplibre-gl-worker-${version}.mjs`);
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.copyFile(source, target);
console.log(`Copied MapLibre worker to ${path.relative(process.cwd(), target)}`);
