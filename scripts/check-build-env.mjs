import { problemsWith } from "./lib/build-env.mjs";

// Runs before every build. A failed production build leaves the current site in place, which beats
// deploying a site whose maps can't load or whose bundle holds a secret.
const problems = problemsWith(process.env);
if (problems.length) {
  console.error(`Build stopped (${process.env.VERCEL_ENV ?? "local"}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
