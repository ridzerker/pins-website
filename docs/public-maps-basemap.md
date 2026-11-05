# Base map for public web maps

Status: **OpenFreeMap Positron is chosen (2026-11-05) and approved for the protected Preview only.** Its
host is in the security policy, and `NEXT_PUBLIC_MAP_PROVIDER=openfreemap` is set for this branch's Preview.
Production has no provider until that variable is set there, so it contacts no map provider and would draw
pins on a plain background with a "Map background unavailable" note.

## Options (terms read 2026-11-05)

| | OpenFreeMap (Positron) | MapTiler website key | Plain background |
|---|---|---|---|
| Look | Real streets and labels in the Pins palette; no places of interest | Closest to the Android app; has places of interest | No geography |
| Key or account | None | Account and an origin-restricted key | None |
| Cost | Free; asks for donations | Flex $30/month with 25k sessions and 500k requests, then $2.50 per 1k sessions and $0.15 per 1k requests. Free plan is described as personal or non-commercial, and pauses at 5k sessions | Free |
| Commercial use | Allowed, per its site | Paid plans | n/a |
| Limits | No limits on views or requests on the public instance | Plan quotas, with a spending limit available | n/a |
| Reliability | No SLA. Terms: "may discontinue it at any time without notice" | Paid service | Local |
| Attribution | "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", added automatically | MapTiler and OpenStreetMap, added automatically | None |
| Privacy | No cookies. Access logs have no IP addresses, error logs may; kept 7 days; 30 days after a security incident. Cloudflare processes requests | MapTiler's own terms | No third party |

Sources: [OpenFreeMap](https://openfreemap.org/), its [terms](https://openfreemap.org/tos/) and
[privacy policy](https://openfreemap.org/privacy/), and [MapTiler pricing](https://www.maptiler.com/cloud/pricing/).
Have someone recheck these before launch: terms change.

**Decision: OpenFreeMap Positron for launch.** It needs no account or spending, and it looks like
Pins in the local demo. Its real risk is reliability, and the page already handles that: if the
provider fails, pins keep working on the plain background with the note. If it proves unreliable or
traffic grows, moving to MapTiler is a configuration change.

The privacy cost is that the provider sees which map area a visitor looks at, with their IP address
reaching its servers. It does not get the username: map pages and the map worker send no referrer.

## What was tested

- `npm run test:basemap` uses fixture provider responses and needs no network: loading, attribution, no
  key, no referrer, and the plain fallback when the style fails, is unrecognized, its tiles fail or the
  security policy blocks it.
- `node scripts/test-basemap.mjs --live` is a local demo against the real OpenFreeMap with fixture pins.
  Run once on 2026-11-05, on desktop and phone sizes, under the real security policy with only
  OpenFreeMap's host added: tiles loaded, no violations, no referrer, attribution shown.
- Not tested: a Vercel preview, Safari, Firefox, real phones, or provider behavior under load.

## Turning on OpenFreeMap in production (needs approval)

`vercel.json` and the Privacy and Cookies text already name OpenFreeMap on this branch. Set
`NEXT_PUBLIC_MAP_PROVIDER=openfreemap` for Production before the merge, and publish the policies in the same
release. Attribution comes from the provider's data and MapLibre shows it automatically.

## Turning on MapTiler instead (needs approval and a paid plan)

Create a website-only key restricted to the site's origins, never the app's key. Set
`NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAP_PROVIDER=maptiler`. `connect-src` already allows
`https://api.maptiler.com`. Update the policies as `privacy-public-maps-draft.md` describes.

## Rolling back

Clear `NEXT_PUBLIC_MAP_PROVIDER` and redeploy: the page returns to the plain background.
