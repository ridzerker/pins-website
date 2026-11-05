import { spawnSync } from "node:child_process";

// One command for every local website check. It builds with fixture values, so it never needs
// production credentials or network access. Run: npm run verify
// Afterwards out/ is a fixture build: run `npm run build` with real values before anything else uses it.
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key", NEXT_PUBLIC_MAPTILER_KEY: "", NEXT_PUBLIC_MAP_PROVIDER: "" };
const steps = ["lint", "typecheck", "test", "build", "test:public-map", "test:marker-parity", "test:website", "build:basemap", "test:basemap"];
const withProvider = new Set(["build:basemap", "test:basemap"]);
for (const step of steps) {
  const started = Date.now();
  const stepEnv = withProvider.has(step) ? { ...env, NEXT_PUBLIC_MAP_PROVIDER: "openfreemap" } : env;
  const { status } = spawnSync("npm", ["run", "--silent", step === "build:basemap" ? "build" : step], { env: stepEnv, stdio: ["ignore", "ignore", "pipe"], shell: true });
  console.log(`${status === 0 ? "PASS" : "FAIL"} ${step} (${Math.round((Date.now() - started) / 1000)}s)`);
  if (status !== 0) { console.log(`Re-run it to see the failure: npm run ${step}`); process.exit(1); }
}
console.log(`${steps.length} website checks passed.`);
