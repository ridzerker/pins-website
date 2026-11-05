# Public maps (`/@username`)

Opt-in public maps that anyone can open without an account, for example `joinpins.app/@alan`.

## How it works

- `vercel.json` rewrites `/@:username` (with or without a trailing slash) to the static shell
  `src/app/map/page.tsx` and sends `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`.
  Next.js rewrites are not available with `output: "export"`, and `@folder` names are parallel-route
  slots, so the route lives at `/map/`.
- The shell contains no user data. In the browser, `src/components/public-map/public-map-app.tsx`
  reads the username from the URL and calls the Pins `get_public_web_map` database function
  (`src/lib/public-map.ts`) with the public anon key, with no session, cookies or referrer, and
  without caching. Turning sharing off in the app takes effect on the next page load. A tab left open
  rechecks when the visitor returns to it, at most once a minute, so a revoked map or deleted pin goes away then.
- The database decides what is public: only users who turned on their web map, only their public
  pins, and a fixed set of fields. `src/lib/public-map.ts` validates the response again, and unknown,
  private and disabled usernames show the same "This map isn't available." page.
- The map uses MapLibre GL (`maplibre-gl`, pinned) with keyboard-accessible markers that reproduce
  the app's pins and camera (`src/lib/pins-marker.ts`, [visual parity](public-map-visual-parity.md)).
  Like the app it does not cluster, except on maps above 300 pins.
  The base map is optional and off by default, with a plain background otherwise: see
  [public-maps-basemap.md](public-maps-basemap.md). MapTiler Basic uses the app's palette through
  `src/lib/pins-map-style.ts`, vendored from the app, and OpenFreeMap through `src/lib/map-provider.ts`. MapLibre v6
  loads its worker from a runtime URL that bundlers cannot see, so the pinned worker and its BSD-3
  license are committed in `public/vendor/` (byte-exact via `.gitattributes`). After upgrading
  `maplibre-gl`, run `node scripts/copy-maplibre-worker.mjs` and update `MAPLIBRE_WORKER_URL`;
  `npm test` fails if they drift.

Per-profile titles are set after load. Link previews use a generic "Explore this map on Pins"
card: per-profile previews would need server rendering, a hosting change that has not been made.

## Configuration

| Variable | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The Pins project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The Pins anon/publishable key (the same public key the app ships) |
| `NEXT_PUBLIC_MAP_PROVIDER` | No | `openfreemap` or `maptiler`; empty contacts no provider |
| `NEXT_PUBLIC_MAPTILER_KEY` | No | A website-only MapTiler key restricted to the site's origins; without it, pins show on a plain background |

Without the Supabase pair, `/@username` pages show "This map isn't available." These values
are compiled into browser JavaScript and are public by design. Never add a Supabase service-role
or secret key, or any non-`NEXT_PUBLIC_` secret. Set them for Preview first, then Production.

## Tests

```sh
npm test                 # includes scripts/test-public-map.mjs (parsing, validation, anonymous fetch)
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build
npm run test:public-map  # headless browser, fixture data, emulated rewrite, no external requests
npm run test:marker-parity  # the app's real marker and helpers against the website's copies
npm run test:website     # existing site suite
```

`npm run verify` runs all of these with fixture values and needs no production access or credentials.
`scripts/test-public-map-live.mjs` is separate: it uses production and only runs with the founder's approval.
`npm run profile:public-map` measures load, panning and selection on synthetic maps of 0 to 2,000 pins.

`test:public-map` covers rendering, markers and details, filters, anonymous requests, responsive
widths with axe, unavailable states, revocation on reload, retry, empty and 2,000-pin maps, and no-JS.
Vercel's rewrite and header behavior can only be confirmed on a preview deployment.
