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
  without caching. Turning sharing off in the app takes effect on the next page load.
- The database decides what is public: only users who turned on their web map, only their public
  pins, and a fixed set of fields. `src/lib/public-map.ts` validates the response again, and unknown,
  private and disabled usernames show the same "This map isn't available." page.
- The map uses MapLibre GL (`maplibre-gl`, pinned) with clustered, keyboard-accessible markers.
  The base map is MapTiler Basic softened with the app's palette (`src/lib/pins-map-style.ts`,
  vendored from the app). Without a MapTiler key it falls back to a plain background. MapLibre v6
  loads its worker from a runtime URL, so `scripts/copy-maplibre-worker.mjs` copies the pinned
  worker into `public/vendor/` (gitignored) before `dev` and `build`.

Per-profile titles are set after load. Link previews use a generic "Explore this map on Pins"
card: per-profile previews would need server rendering, a hosting change that has not been made.

## Configuration

See `.env.example`. The Supabase pair is required; without it the pages show "not available".
All values are public by design. Never add a service-role key.

## Tests

```sh
npm test                 # includes scripts/test-public-map.mjs (parsing, validation, anonymous fetch)
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key npm run build
npm run test:public-map  # headless browser, fixture data, emulated rewrite, no external requests
npm run test:website     # existing site suite
```

`test:public-map` covers rendering, markers and details, filters, anonymous requests, responsive
widths with axe, unavailable states, revocation on reload, retry, empty and 2,000-pin maps, and no-JS.
Vercel's rewrite and header behavior can only be confirmed on a preview deployment.
