import fs from "node:fs";

// Applies vercel.json's headers the way Vercel does: every matching rule, later rules winning a key.
// Local test servers use this, so the browser tests run under the real Content-Security-Policy.
const config = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
// The sources here use only Vercel's (.*) group and :name / :name* parameters.
const toRegExp = source => new RegExp(`^${source.replace(/\/:\w+\*/g, "(?:/.*)?").replace(/:\w+/g, "[^/]+")}$`);

export function headersFor(pathname) {
  const headers = {};
  for (const rule of config.headers) if (toRegExp(rule.source).test(pathname)) for (const { key, value } of rule.headers) headers[key] = value;
  return headers;
}
