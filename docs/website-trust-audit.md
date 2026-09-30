# Website trust, accessibility, and design sprint

Audit date: September 28, 2026. Scope: this standalone website repository only. No mobile application or production infrastructure changes. These findings are not a certification of legal compliance.

## Update — September 29, 2026: real app imagery and support mailbox

- **Support mailbox resolved.** The owner confirmed **support@joinpins.app** is the official, working support mailbox. `supportEmail` in `src/lib/site-config.ts` is set to it and the unavailable-email fallbacks were removed. Support, Data Requests, Privacy, Terms, the home beta inquiry, and the footer now link to `mailto:support@joinpins.app`. The request-handling/fulfillment process behind the mailbox is still an owner responsibility (see release gates).
- **Real screenshots replace illustrated UI.** The coded phone mockup (fictional map, "My places 12" sheet, nav that did not match the app, floating notes) and the Save/Circles/Discover mini-UIs were replaced with owner-supplied Pins screenshots: Home map (hero and Save card crop), Walnut Circle map, and Explore public maps. Derivatives are cropped/resized WebP only. The fake "Only me / My Circles / Everyone" picker was replaced by an abstract diagram because no supplied screenshot shows the real control. `src/components/map-preview.tsx`, its CSS, and four icons used only by it were deleted.
- **Footer.** The © line was removed; the bottom row now reads "Pins · joinpins.app" and the tagline. No ©, ™, or ® marks were added.
- Policy copy that called the app screens "illustrations" now calls them static screenshots; revision date moved to September 29, 2026.

## Checkpoint A — initial audit

- Clean Git working tree before edits. Next.js **16.3.5**, React/React DOM **19.3.0**, TypeScript **5.9.3**, Tailwind **4.3.3** installed (package ranges are broader). App Router, static export, trailing slashes. Read the installed Next layout, CSS, font, and static-export guides before coding.
- Existing routes: `/`, `/privacy`, `/support`, `/delete-account`, `/auth/confirmed`, custom 404; robots and sitemap. Shared root header/footer; shared document wrapper; confirmation CSS module.
- Fonts: Arial/Helvetica global fallback and explicit Arial in map SVG. No licensed brand webfont. Many unrelated small content sizes, hard-coded footer year, a hidden mobile navigation link, sparse footer, and distinct confirmation button radius.
- No website forms, signup/login, guest mode, uploads, payment endpoints, waitlist database, newsletter service, live maps, geocoding, location permission, advertising, tracking pixels, analytics, monitoring SDK, external scripts, social feeds, or media embeds.
- No cookies, localStorage, sessionStorage, or website auth client in source. The confirmation page reads query/fragment values and cleans recognized credentials using browser history; query values can reach host logs first. No Supabase runtime dependency; the documented **upstream mobile email-confirmation** flow uses Supabase.
- *(Resolved September 29, 2026 — mailbox confirmed; see update above.)* Contact address `support@joinpins.app` existed in multiple mail links, but README explicitly described it as a placeholder awaiting setup. The owner was asked to confirm a monitored mailbox. DNS or syntactically valid mail links would not prove that mailbox exists or requests are handled.
- App Store-style hero link actually jumped to coming-soon copy. “Get notified” opened email and did not subscribe anyone. No actual App Store/TestFlight/open-app target exists. App-opening constant remains null.
- No testimonials or real user metrics. *(Superseded September 29, 2026: illustrated UI replaced by real app screenshots.)* Initials, place names, and “12” saved places belonged to fictional illustrated UI, not endorsements. No fake countdown, scarcity, guilt copy, cancellation trap, or preselected consent.
- Existing privacy page was explicitly a draft in README. Its age threshold, exact sharing defaults, profile-discovery behavior, and deletion steps were not established by executable website code. No corporate identity, address, jurisdiction, retention schedule, international-transfer details, or approved age policy was discoverable here.

## Checkpoint B — visual system

Inter v4.1, self-hosted through `next/font/local` in the root layout. One font variable feeds body and Tailwind; controls inherit it; map SVG inherits it. Public content uses display, H1, H2, H3, body-large, body, small, caption, and button tokens. Fixed miniature sizes remain only for illustration proportions. Regular/medium/semibold weights dominate; the wordmark uses bold.

Preserved the cream/moss identity, four feature cards, and existing artwork. Centralized content gutters, readable document width, card/control radii, focus styling, and control sizing. Increased small marketing/footer text and darkened muted text. Footer includes Product, Legal, and Contact columns (the build-year copyright line was removed September 29, 2026). Mobile header keeps all three links visible without a menu toggle; no hamburger/dialog or focus trap is necessary.

## Checkpoint C — trust surfaces

- New direct routes: `/terms`, `/cookies`, `/data-request`.
- Reworked `/privacy`, `/support`, `/delete-account`; old deletion URLs continue to work. Added new routes to sitemap; confirmation stays noindex and excluded.
- Shared document scaffolding: title, intro, revision date on policies/request page, optional table of contents, normal site navigation, readable measure.
- Privacy distinguishes actual website processing, email correspondence, upstream confirmation, illustrative maps, device location versus saved place coordinates, public-content copies, retention limitations, rights, and missing app-specific assurances. Does not claim a comprehensive mobile SDK audit.
- Terms address responsible use, accounts, content ownership and necessary processing permission, location accuracy, sharing, IP, third parties, availability, suspension, and mandatory consumer rights. No invented entity/jurisdiction, arbitration, fixed damages cap, or refund terms.
- No data-submission backend was added. `src/lib/site-config.ts` centralizes the contact email and subjects. *(September 29, 2026: now set to the confirmed `support@joinpins.app`.)* At the time of this checkpoint `supportEmail` was null: contact/request surfaces explicitly say unavailable, and no dead mail links are presented. Setting a verified address enables the email request CTA, literal-address fallback, support links, and an optional beta-availability inquiry. The message is sent by the user from their email client, not submitted by the website.
- This was a **release blocker** while the address was null (mailbox resolved September 29, 2026; fulfillment workflow still open). The site cannot receive a privacy request in that state. A visited page never claims a request was submitted or an account deleted.

## Checkpoint D — audits and remediation

### Services

| Service | Purpose | Data potentially involved | Cookies/storage | Disclosure needed? | Keep/remove |
|---|---|---|---|---|---|
| Static website host (Vercel suggested in README; production configuration unverified) | Deliver pages/assets | IP, URL/query, browser headers; operational logs depend on host | None set by application; host behavior must be verified | Privacy/Cookies explain hosting processing without claiming a confirmed provider | Keep delivery; verify production |
| support@joinpins.app (confirmed working by owner; mailbox provider not documented here) | Support and privacy requests | Sender address, text, chosen attachments | External email service, not website storage | Privacy and request-page explanation | Keep; mail links enabled site-wide |
| Supabase upstream verification, documented in `docs/email-confirmation.md` | Verify mobile signup email before redirect | Account email/verification data upstream; result parameters at website | No Supabase website SDK/session | Privacy/Cookies distinguish upstream service | Keep result page; live setup remains unverified |
| Inter v4.1 local webfont | Typography | Ordinary same-origin asset request | Browser asset cache; no vendor request | Font provenance and license included | Keep |
| Next/React/Tailwind | Build/render website | Navigation to same-origin pages/assets | No application persistence | No additional tracking disclosure | Keep core dependencies |
| Playwright Core / axe-core | Development-only browser/accessibility tests | Synthetic local test URLs and rendered markup | Isolated temporary browser profile; not shipped as website scripts | No visitor disclosure necessary | Keep dev-only |

### Forms, age, email, and data minimization

No form fields or age collection exist. No website authentication was changed. No new tracking, database, session, or request analytics was introduced. Request guidance asks only for request type, account email/username where relevant, and necessary context. Device/app details are optional for technical issues; passwords, confirmation links, codes, and unrelated sensitive information are discouraged.

Changed beta mail copy from “Get notified” to an availability question (only if the mailbox is enabled). This avoids implying an automated subscription. No marketing sender/templates, subscription list, or unsubscribe endpoint exists in this repository. Transactional confirmation is upstream; actual external email templates, delivery, and any external marketing subscriptions **cannot be audited here**. No fake unsubscribe link added.

Removed the draft's unsupported under-13 statement rather than inventing eligibility. No replacement age threshold or parental-consent system was created. The owner must decide eligibility and have app notices and safeguards reviewed before launch.

### Claims, controls, and accessibility

- Replaced App Store-style download treatment with an explicit coming-soon anchor; no fake store URL or disabled download button.
- Replaced unverified “private by default” guarantees with audience-choice language; retained the product concept and ordinary feature explanations. Exact app capabilities still need confirmation against the shipping app.
- Confirmation direct visits now say “Return to Pins” and explain that the page cannot verify account status. Existing token/error handling and tests retained; no new auth mechanism.
- *(Superseded September 29, 2026: real screenshots with descriptive alt text and an “Actual screenshot” caption.)* Phone mockup has a single meaningful image description and visible “Not interactive” caption. Decorative feature illustrations/icons are hidden from assistive technology; logo is decorative inside a “Pins home” link. No image filename alt text.
- Visible focus, focusable skip targets, semantic anchors, no clickable divs, no modal/dropdown traps. Reduced motion supported. No optional-consent controls because there is no optional tracking.

### Asset provenance

| Asset/source | Evidence | Status |
|---|---|---|
| `src/app/fonts/InterVariable.woff2` | Official tagged source: https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable.woff2 | SIL OFL 1.1 license copied to `src/app/fonts/OFL.txt`; self-hosted |
| Inter font checksum | SHA-256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` | Reproducible provenance |
| `public/brand/mark.svg`, `navbar.svg`, `navbar.png`, `src/app/icon.svg`, `public/og-image.png` | Repository brand assets; `scripts/create-og.ps1` delegates to adjacent app brand-export scripts | Preserve; owner should confirm master artwork rights and any baked-in font provenance. Do not run that script during a website-only sprint |
| `src/components/icons.tsx` | Inline SVG in this repository; no stock image service | Preserve; original authorship/license chain not independently established |
| `src/assets/app/*.webp` | Cropped/resized derivatives of real Pins app screenshots supplied by the owner (September 29, 2026) | Replaced the deleted map/phone/Circle illustrations. Screens show real people's names/photos and pin locations; owner to confirm consent to publish |
| Apple symbol previously in hero CTA | Removed with misleading store-download treatment | No Apple glyph asset added |
| Framework/test packages | License metadata in installed packages/lockfile; no icon or stock library added | Core deps retained; tests development-only |

No stock photography or remote font/image CDN found. Repository presence alone does not prove ownership of brand artwork.

### Conditional items

- Refund Policy: **N/A at current product stage — no paid products discovered.** No `/refunds` route/footer link.
- Hidden fees: **No website payment flow discovered; hidden-fee remediation currently N/A.**
- Cookie banner: none; application sets no cookies/persistent storage or optional trackers. Production host behavior remains to verify.
- Fake reviews: none found. Product imagery is now real app screenshots, captioned as such.
- Email unsubscribe: N/A for website code; external sending/templates remain unverified.

## Checkpoint E — validation

The browser harness serves `out/` locally, launches an isolated headless Chrome, and writes screenshots and JSON to ignored `.preview/sprint/`. It does not inspect the user's browser profile or submit any messages. The live browser connector was unavailable; the isolated browser harness completed the checks instead.

Commands: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:website`, `git diff --check`.

Final results:

- Lint, typecheck, production build, and whitespace validation passed. All eight page routes, the custom 404, and metadata routes export successfully.
- Six confirmation unit tests passed. The pre-existing Node `MODULE_TYPELESS_PACKAGE_JSON` informational warning remains; no lint or build warnings/errors were introduced.
- **54 responsive/accessibility scans passed:** `/`, `/privacy/`, `/terms/`, `/cookies/`, `/data-request/`, `/support/`, `/delete-account/`, `/auth/confirmed/`, and a missing route at **320, 390, 430, 768, 1024, 1440px**. No horizontal overflow; exactly one main landmark and H1; all images have alt attributes; shared Inter font verified; no axe WCAG 2 A/AA or 2.1 AA violations.
- **161 rendered internal links** exercised through keyboard Enter, including header, footer, logos, back links, hero anchors, legal cross-links, contents anchors, confirmation fallback, and 404 recovery. Tab traversal, visible focus, skip-link focus transfer, 200% text reflow, and reduced-motion scrolling passed on all nine page states.
- Six browser confirmation scenarios (direct, expired fragment, invalid query, generic error, token-hash rejection, synthetic credential fragment) passed after hydration and reload. Raw synthetic credentials were removed. Browser error pages offer support and home paths.
- Initial browser testing caught a real confirmation skip-link bug: URL cleanup serialized `#main-content` as `#main-content=`. Fixed the helper, added a regression test, and confirmed real keyboard behavior. Also repaired two low-contrast illustration labels found by axe.
- Privacy remains readable without JavaScript; confirmation presents its no-JavaScript guidance. No website cookies, local/session storage, external network requests, or runtime errors were detected in the tested export.
- Desktop/mobile screenshots were produced for every route. Visually reviewed homepage, Privacy, Terms, and Data Requests; adjusted hero tracking, illustration clipping, and miniature line height. Automated scans are not a complete assistive-technology or real-device certification.
- Real mailbox delivery, the email-enabled conditional branch, production host behavior, Supabase verification, installed-app launch, App Store/TestFlight destinations, actual deletion fulfillment, and screen-reader/device testing remain unverified. No mail was sent.

### Buttons and links: final inventory

| Page/component | Button/link | Current behavior | Fixed? | Remaining issue |
|---|---|---|---|---|
| Global header/footer | Logos, Meet Pins, Support, Coming soon | Keyboard-operable home/routes/anchors; mobile links visible | Yes; tested | None in local export |
| Home hero | App Store-style CTA | Replaced by “Coming soon to iPhone” linking to availability copy | Yes; tested | Actual store/beta URL not supplied |
| Home availability | Ask about beta access | Opens email to support@joinpins.app; no subscription | Yes; syntax tested | Replies depend on the mailbox owner |
| Global footer / policies | Privacy, Terms, Cookies, Data Requests, Account deletion | Direct routes and cross-links work | Yes; tested | Policy/business approvals still needed |
| Support / Data Requests / policy contact | Email/privacy request | `mailto:support@joinpins.app` (mailbox confirmed September 29, 2026) | Yes; syntax tested | Request-handling/fulfillment workflow still to be documented |
| Confirmation | Skip to content | Preserves anchor and focuses main | Yes; regression + browser tested | None in local export |
| Confirmation | Back to Pins website / error help | Routes home/support; no false verification claim | Yes; tested | Actual email/Supabase end-to-end flow not tested |
| Confirmation | Open Pins | Not rendered; manual opening guidance | Intentional fallback | Verified installed-app URL absent |
| App screenshots | Controls visible inside screenshots | Static images with alt text; not focusable controls | Yes | No live map functionality intended |
| Missing page | Head back to Pins | Returns home | Tested | None in local export |

No `href="#"`, empty internal destination, dead rendered button, or locally broken rendered link remains in the tested export. This does **not** make the unavailable contact/request workflow functional. There are no signup/login/guest controls, forms, cookie buttons, social links, dropdowns, or modals to test.

### Changed-file groups

- Shared design/navigation: `src/app/globals.css`, `layout.tsx`, `src/components/site.tsx`, `map-preview.tsx`, `src/app/fonts/` (font + license).
- Content/routes: home, Privacy, Support, Account Deletion; new Terms, Cookies, Data Requests; sitemap; `src/lib/site-config.ts`.
- Confirmation: page, panel, CSS module, `src/lib/confirmation.ts`, unit-test regression.
- Verification/docs: `scripts/test-website.mjs`, package scripts/lockfile (development-only Playwright Core and axe), README, this audit, confirmation documentation.

## Remaining owner decisions / release gates

1. ~~Confirm a monitored support/privacy mailbox and enable it in `site-config.ts`~~ — **resolved September 29, 2026** (`support@joinpins.app`). Still open: document and test the real request-handling process (identity checks, deletion/access fulfillment). A working mailbox does not by itself prove fulfillment.
2. Supply legal operator identity and required contact/address details, launch jurisdictions, applicable legal bases, provider identities/regions, transfer safeguards if relevant, and retention/deletion/backup handling. Review policy/Terms text against those facts; no compliance certification is implied.
3. Approve app eligibility/children's-data policy; verify actual location/visibility/profile/Circle and in-app deletion behavior. This sprint deliberately does not audit or alter mobile SDKs or app code.
4. Verify live hosting cookies/scripts/logging and email handling. Repository/local export results do not establish production behavior.
5. Complete the previously documented Supabase redirect/template and mobile confirmation integration; test real emails and installed devices. Supply real store/beta/open-app destinations when available.
6. Confirm brand asset provenance and any typography baked into old social/brand images. Inter is the only new font and includes its license.

## Reference guidance

Audit-informed copy, not a jurisdiction-specific legal opinion. Controller/recipient/retention omissions are tracked using [ICO privacy-information guidance](https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment-medium-businesses/what-information-you-must-supply-under-the-gdpr/). Conditional cookie handling was checked against [ICO cookie guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/). Font provenance: [official Inter project](https://rsms.me/inter/) and the bundled license. Applicability depends on the owner’s operations and jurisdiction.
