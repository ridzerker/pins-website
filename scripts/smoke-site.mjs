// Read-only checks of a deployed site: only GET requests, and it changes nothing. Run it right after a
// production deploy, and any time something looks wrong. Exit code 1 means at least one check failed.
//   node scripts/smoke-site.mjs                              the site and how missing maps behave
//   node scripts/smoke-site.mjs --username=<opted-in name>   also a live map's page and its data
// --username needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. It makes
// one anonymous read, the same one any visitor's browser makes.
// Vercel Authentication blocks this on a protected preview, so it is for the public production site.
const option = (name, fallback = null) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = option("base", "https://www.joinpins.app").replace(/\/$/, "");
const apex = option("apex", "https://joinpins.app").replace(/\/$/, "");
const username = option("username");
const UNKNOWN = "no_such_user_smoke_test";

let failed = 0, passed = 0;
const check = (label, ok, detail = "") => { if (ok) passed++; else failed++; console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && detail ? ` (${detail})` : ""}`); };
const get = (url, init) => fetch(url, { redirect: "follow", cache: "no-store", ...init });
const attempt = async (label, run) => { try { await run(); } catch (error) { check(label, false, error.message); } };

for (const page of ["/", "/privacy/", "/cookies/", "/terms/", "/support/", "/data-request/", "/delete-account/"]) {
  await attempt(`page ${page}`, async () => {
    const response = await get(base + page);
    check(`page ${page} loads`, response.ok, `status ${response.status}`);
    const headers = response.headers;
    const policy = headers.get("content-security-policy") ?? "";
    check(`page ${page} has its security headers`, /frame-ancestors 'none'/.test(policy) && /object-src 'none'/.test(policy) && !/unsafe-eval/.test(policy)
      && headers.get("x-frame-options") === "DENY" && headers.get("x-content-type-options") === "nosniff" && /max-age=\d{8}/.test(headers.get("strict-transport-security") ?? ""), policy ? "a header differs" : "no policy");
    check(`page ${page} is indexable`, !/noindex/i.test(headers.get("x-robots-tag") ?? ""));
    const html = await response.text();
    check(`page ${page} carries its script-hash policy`, /<head[^>]*><meta http-equiv="Content-Security-Policy" content="script-src 'self'/.test(html));
  });
}

const privacy = await get(`${base}/privacy/`).then(r => r.text()).catch(() => "");
check("the Privacy Policy describes web maps and the map provider", /Public web maps/.test(privacy) && /OpenFreeMap/.test(privacy));
const cookies = await get(`${base}/cookies/`).then(r => r.text()).catch(() => "");
check("the Cookies page names the map provider", /OpenFreeMap/.test(cookies));

await attempt("the preview image", async () => { const r = await get(`${base}/og-image.png`); check("the preview image loads", r.ok && /image\/png/.test(r.headers.get("content-type") ?? ""), `status ${r.status}`); });
await attempt("the sitemap", async () => { const text = await get(`${base}/sitemap.xml`).then(r => r.text()); check("the sitemap lists no maps", /<urlset/.test(text) && !/\/@|\/map\//.test(text)); });
await attempt("the 404 page", async () => { const r = await get(`${base}/no-such-page-smoke-test/`); check("an unknown page is a real 404", r.status === 404, `status ${r.status}`); });

// One static page serves every username, so a missing map looks the same as a real one until the browser asks for its data.
for (const [label, path] of [["no slash", `/@${UNKNOWN}`], ["a slash", `/@${UNKNOWN}/`], ["capitals", `/@${UNKNOWN.toUpperCase()}`], ["a query", `/@${UNKNOWN}?pin=abc`]]) {
  await attempt(`map link with ${label}`, async () => {
    const response = await get(base + path);
    check(`a map link with ${label} reaches the map page`, response.ok, `status ${response.status}`);
    check(`a map link with ${label} stays out of search and sends no referrer`, /noindex/.test(response.headers.get("x-robots-tag") ?? "") && response.headers.get("referrer-policy") === "no-referrer");
    const html = await response.text();
    check(`a map link with ${label} reveals nothing about the name`, !html.includes(UNKNOWN) && !html.includes(UNKNOWN.toUpperCase()));
  });
}
await attempt("the apex redirect", async () => {
  const response = await get(`${apex}/@${UNKNOWN}?pin=abc`, { redirect: "manual" });
  const target = response.headers.get("location") ?? "";
  check("the apex address redirects with its path and pin", response.status >= 300 && response.status < 400 && target.includes(`/@${UNKNOWN}`) && target.includes("pin=abc"), `status ${response.status}`);
});
await attempt("the map provider", async () => {
  const response = await get("https://tiles.openfreemap.org/styles/positron", { headers: { Origin: base } });
  check("the map provider answers", response.ok && (await response.json()).version === 8, `status ${response.status}`);
});

if (username) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""), key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  await attempt("the opted-in map", async () => {
    if (!url || !key) throw new Error("set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const read = name => get(`${url}/rest/v1/rpc/get_public_web_map`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ target_username: name }) });
    const started = Date.now();
    const response = await read(username);
    const text = await response.text(), map = JSON.parse(text);
    check("the opted-in account's map data loads", response.ok && map?.profile?.username?.toLowerCase() === username.toLowerCase(), `status ${response.status}`);
    check("its data holds only the published fields", map && JSON.stringify(Object.keys(map).sort()) === '["pins","profile","truncated"]' && !/created_at|creator_id|is_public|circle_visibility|email/.test(text));
    console.log(`     ${map?.pins?.length ?? 0} pins, ${text.length} bytes, ${Date.now() - started} ms`);
    check("an unknown name returns nothing", (await read(UNKNOWN).then(r => r.text())) === "null");
    const table = await get(`${url}/rest/v1/pins?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    check("anonymous table reads return no rows", (await table.text()) === "[]");
  });
}

console.log(`${passed} passed, ${failed} failed against ${base}`);
if (!username) console.log("Not checked: a live map. Run again with --username=<opted-in name>, then look at it in a browser for tiles, markers and the console.");
process.exitCode = failed ? 1 : 0;
