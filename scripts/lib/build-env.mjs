// What a build may contain. NEXT_PUBLIC_* values end up in every visitor's browser, so a secret there
// is public the moment it deploys, and a production build with missing settings breaks every map.
// Problems name the variable only, because build logs are kept and must never repeat a value.
const roleOf = value => {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? "unknown"; } catch { return "unknown"; }
};

export function problemsWith(env) {
  const problems = [];
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    const value = String(raw ?? "").trim();
    const role = roleOf(value);
    if (/SERVICE|SECRET|PASSWORD|PRIVATE/i.test(name)) problems.push(`${name}: this name suggests a secret, and every NEXT_PUBLIC_ value reaches the browser.`);
    else if (value.startsWith("sb_secret_") || (role && role !== "anon")) problems.push(`${name}: this holds a privileged key, and every NEXT_PUBLIC_ value reaches the browser. Remove it and rotate the key.`);
  }
  if (env.VERCEL_ENV !== "production") return problems;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const provider = env.NEXT_PUBLIC_MAP_PROVIDER?.trim().toLowerCase() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) problems.push("NEXT_PUBLIC_SUPABASE_URL: production needs the project's https://<ref>.supabase.co address. Without it every map says it isn't available.");
  if (!(roleOf(anonKey) === "anon" || anonKey.startsWith("sb_publishable_"))) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: production needs the public anon key. Without it every map says it isn't available.");
  if (provider !== "openfreemap") problems.push('NEXT_PUBLIC_MAP_PROVIDER: production needs "openfreemap". Without it maps have no streets or labels.');
  return problems;
}
