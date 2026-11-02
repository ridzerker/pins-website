// MapLibre GL v6 loads its worker from a URL computed at runtime, which bundlers cannot see, so the
// pinned worker is committed in public/vendor/ (with its BSD-3 license). This script refreshes it
// after a maplibre-gl upgrade and runs before dev and build so a version mismatch fails loudly.
// scripts/test-public-map.mjs checks the committed copy matches node_modules byte for byte.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("maplibre-gl/package.json");
const expected = "6.14.0"; // Must match MAPLIBRE_WORKER_URL in src/components/public-map/map-canvas.tsx.
if (version !== expected) throw new Error(`maplibre-gl ${version} installed; update MAPLIBRE_WORKER_URL and this script for ${expected}.`);
const pkg = path.dirname(require.resolve("maplibre-gl/package.json"));
const vendor = path.resolve("public/vendor");
await fs.mkdir(vendor, { recursive: true });
await fs.copyFile(path.join(pkg, "dist", "maplibre-gl-worker.mjs"), path.join(vendor, `maplibre-gl-worker-${version}.mjs`));
await fs.copyFile(path.join(pkg, "LICENSE.txt"), path.join(vendor, "maplibre-gl-LICENSE.txt"));
console.log(`MapLibre worker ${version} is in public/vendor/`);
