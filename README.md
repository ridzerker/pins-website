![pins.](public/brand/navbar.svg)

# Pins website

A public website for Pins at **joinpins.app**. Next.js App Router, React, TypeScript, and Tailwind CSS; all routes export to `out/`. There is no website database, login, payment system, or third-party analytics.

## Development and verification

Use Node.js 22.6+ (tested with Node 24). On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:website
```

The dev site is at http://localhost:3000. Build before running website tests. The test harness serves `out/` on a temporary localhost port and launches isolated headless Chrome; it does not use your browser profile. On Windows it defaults to `C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `PINS_TEST_BROWSER` to another Chromium executable path on other installations. Screenshots and detailed JSON results go to ignored `.preview/sprint/`.

The browser suite covers every route and link, 320/390/430/768/1024/1440 widths, 200% text, axe WCAG A/AA checks, keyboard activation/skip links, TestFlight CTA presence and off-site link destinations/`rel`, the desktop-only QR code, a guard against outdated launch copy, confirmation error handling and URL cleanup, no-JavaScript fallback, browser storage, and external requests. A local static-server result does not verify deployed hosting or real email/app behavior.

## Routes and shared code

- `/`: landing page, four feature blocks, and the iOS beta section (`#download`); real Pins app screenshots (static images), not a live map.
- `/privacy`, `/terms`, `/cookies`: website policies.
- `/data-request`: privacy/account request guidance and the email request route.
- `/support`, `/delete-account`: help and existing in-app deletion guidance.
- `/auth/confirmed`: shows "Email confirmed" only for Supabase's signup success redirect; never verifies or confirms an account itself. See [email confirmation setup](docs/email-confirmation.md).
- `src/components/site.tsx`: header, footer, contact display, document layout.
- `src/lib/site-config.ts`: production URL, support address (`support@joinpins.app`), TestFlight invitation, and policy revision date.
- `src/components/testflight-qr.tsx`: desktop QR code, generated at build time from the TestFlight URL.
- `src/app/layout.tsx`, `globals.css`, `fonts/`: self-hosted Inter, global design tokens, responsive styling. The font's SIL OFL license is included.
- `src/components/app-screens.tsx`, `src/assets/app/`: real app screenshots (hero phone and feature cards).
- `src/components/icons.tsx`, `public/brand/`: local icons and brand artwork.

The site has no forms, cookie consent state, optional tracking, or embedded third-party content. There are no testimonials, ratings, or user statistics; names, places, and counts visible inside app screenshots are real app content, not endorsements.

## App screenshots

Product imagery is real screenshots of the Pins iPhone app supplied by the owner (September 29, 2026). Files in `src/assets/app/` are WebP derivatives that are only cropped and resized; never redraw, retouch, or alter the UI inside them. Static export has no image optimizer, so they are pre-sized for high-DPI screens (hero 828px wide, feature crops 720px) and rendered with `next/image` using `unoptimized`. Regenerate from the original 1170×2532 PNGs with `sharp` if a screen changes. The Keep Control card intentionally uses an abstract diagram because no supplied screenshot shows the audience picker.

## Support contact

**support@joinpins.app** is the official, working Pins support mailbox (confirmed by the owner on September 29, 2026). It is set once as `supportEmail` in `src/lib/site-config.ts` and used for support, privacy/data requests, policy questions, and beta questions through `mailto:` links. Change it only there.

The website only opens the visitor's email app; it does not send email, submit requests, or execute account deletion.

## iOS beta (TestFlight)

Pins is in public beta through Apple TestFlight, not the App Store. The public invitation (verified October 14, 2026) is set once as `testFlightUrl` in `src/lib/site-config.ts`, next to `testFlightAppUrl` (Apple's TestFlight app). The header CTA, hero, `#download` section, footer, and Support page all read it, and the desktop QR code is generated from it at build time with `qrcode`, so changing the constant updates everything. Off-site links go through `ExternalLink` in `src/components/site.tsx` (new tab, `noopener noreferrer`, screen-reader notice). `scripts/test-website.mjs` repeats the URL as an independent check; update both together. When Pins reaches the App Store, revisit the beta copy on Home, Support, Terms, and Privacy.

## Deploy

Deploy the generated `out/` as static files with directory-index support and `404.html` as the 404 document. Do not use `next start`. The project uses trailing-slash routes; preserve URL query and fragment behavior on production redirects.

Production responds from Vercel (response headers checked October 14, 2026), and joinpins.app 308-redirects to www.joinpins.app, which is why `siteUrl` uses www. The Vercel dashboard and Git integration were not inspected. If using Vercel, import this repository with the Next.js preset and build command `npm run build`. No application environment variables are required. Review domain settings and actual network/storage behavior after deployment. This sprint does not deploy or push.

## Before launch

Read the [full website audit, service inventory, asset provenance, checks, and release gates](docs/website-trust-audit.md).

Required owner follow-ups include the privacy-request handling and fulfillment workflow (the support mailbox itself is confirmed); legal operator/contact/jurisdiction details; applicable processing bases, providers and retention practices; age eligibility; the shipping app's location, visibility and deletion behavior; and brand asset rights. Policies describe supported website facts and do not certify legal compliance or substitute for an app SDK/privacy audit.

No refunds page is needed while there are no paid products. No cookie banner is included while the website has no optional tracking. Check any external email templates/marketing before calling unsubscribe handling complete. The public TestFlight invitation is verified; add App Store or open-app targets only after verification.

Do not run `scripts/create-og.ps1` during website-only work: it invokes brand-generation scripts in the adjacent mobile repository. Existing exported brand assets are preserved. On October 14, 2026, `public/og-image.png` was re-rendered with that script's exact recipe (verified pixel-identical first), changing only the status line from "Coming soon for iPhone" to "Public beta for iPhone on TestFlight". The mobile repository's `scripts/export-brand.cjs` still contains the old line; update it there before running `create-og.ps1`, or the outdated image returns.
