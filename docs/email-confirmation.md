# Email confirmation landing flow

## Architecture

Canonical public destination: **https://www.joinpins.app/auth/confirmed**. The existing static export uses `trailingSlash: true`, so the served page/canonical metadata ends in `/`.

Mobile signup → Supabase confirmation email → Supabase verifies the link → website displays the result → user returns to Pins to sign in. The website does not verify tokens, exchange codes, create a session, or access Supabase. No callback endpoint, SDK, credentials, or resend form is needed.

The page shell, metadata, shared header/logo/footer, and surface are prerendered. Only the result panel reads browser query/fragment parameters. It renders neutral copy until hydration, then return-to-app guidance by default, invalid/expired for recognized link failures, or generic failure for other errors. Errors in either source take precedence, including duplicate keys. Raw error text is never displayed. Token/token-hash/PKCE-code callbacks and non-signup auth types fail safely instead of claiming verification. A direct visit shows return-to-app guidance and explicitly says that the website cannot check account confirmation. The internal no-error state is not proof of verification or an authorization check.

Ordinary document anchors, including the keyboard skip target, are preserved. Recognized credentials and raw errors are removed with `history.replaceState`, retaining a fixed error code for reload/back behavior. No tokens are stored, logged, or passed to the app. A `no-referrer` meta policy limits referrer leakage, but incoming query strings still reach the hosting server before JavaScript cleans them. Keep the standard Supabase verification URL; do not put verification tokens in this website's query string. There is no analytics. JavaScript-disabled visitors see neutral guidance. Metadata is `noindex, nofollow`; the route is not added to navigation or sitemap.

## Repository audit (September 18, 2026)

- Website: static Next.js App Router with no Supabase package/auth code. Existing ivory/moss/sage palette, Arial typography, logo/header/footer, icons, and button styles are reused; new styling is scoped to this route.
- Adjacent mobile repository, inspected read-only: `../Pins/app/index.tsx`, `signUp` begins at line 105, `supabase.auth.signUp` at line 111. It supplies only email/password. The current post-signup message tells users to return and log in.
- `../Pins/lib/supabase.ts` uses native persisted storage and `detectSessionInUrl: false`; it does not explicitly opt into PKCE. No token-hash callback, custom verification template, redirect convention, or resend-email function was found in the searched app/lib/components/hooks/docs sources.
- `../Pins/app.json:8` declares scheme `pins`, but no documented production opening target, associated domains, or Android App Link was found. A scheme declaration is not evidence of a tested production destination.
- Live Supabase Site URL, redirect allowlist, and email template were not inspected or changed. Confirm the dashboard settings before rollout. The mobile repository was not modified.

## Aaron's manual Supabase setup (after website review and deployment)

1. In the correct Supabase project, open **Authentication → URL Configuration → Redirect URLs**. Add `https://www.joinpins.app/auth/confirmed` and `https://www.joinpins.app/auth/confirmed/` for the existing trailing-slash convention. Avoid broad production wildcards.
2. Use www in the app. Add `https://joinpins.app/auth/confirmed` and its slash variant only if an existing sender/build still uses the apex domain. The apex → www redirect must preserve path/query and must not supply or overwrite a fragment. Fragments are browser-side and cannot be read by the server. Using www directly avoids that redirect. No domain or redirect settings were changed here.
3. Review **Site URL**, the fallback when a flow omits a redirect. For a production website fallback use `https://www.joinpins.app`, but preserve a deliberate mobile callback until other flows (especially password recovery) are audited. Do not globally set Site URL to this confirmation page. The explicit signup option below is the required change.
4. Confirm email verification is enabled for email/password signup. Keep other auth settings unchanged.
5. Open **Authentication → Email Templates → Confirm signup** and inspect the button as described below. Do not send users to the new destination until the deployed page exists.

See Supabase's [redirect allowlist, fallback, and fragment error documentation](https://supabase.com/docs/guides/auth/redirect-urls).

## Required mobile change (documented only)

In `C:/Users/Windows 11/OneDrive/Documents/Pins/app/index.tsx`, inside `signUp`, replace the line-111 call with:

```ts
const { data, error } = await supabase.auth.signUp({
  email: email.trim(),
  password,
  options: {
    emailRedirectTo: 'https://www.joinpins.app/auth/confirmed',
  },
});
```

Retain current error handling and instructions to return to Pins to log in. The website does not automatically authenticate the app. If a resend function is added later, supply the same `options.emailRedirectTo`. The website does not invent a resend feature the current app lacks; errors offer the existing support page.

## Email template

The standard button can remain:

```html
<a href="{{ .ConfirmationURL }}">Confirm email</a>
```

`ConfirmationURL` includes Supabase's verification endpoint and the requested redirect. Do not replace it with just `{{ .RedirectTo }}` or a direct landing-page link: Supabase must verify first. With the allowlist and signup option above, a standard ConfirmationURL template needs no change.

If the live template instead links to `auth/confirm?token_hash=...`, first identify that endpoint and its dependencies. That architecture was not found locally. Do not point a token-hash template at this static page. If it has no dependencies and Supabase-hosted verification is intended, the exact recommended replacement is the ConfirmationURL anchor above. Otherwise integrate the existing callback in a separate reviewed task before rollout. See [Supabase email template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

## Open Pins configuration

`src/lib/pins-app.ts` exports `pinsAppOpenUrl: string | null = null`. No fake app/store URL is used. Currently success says **Open Pins on your device to sign in**, and the working primary button **Back to Pins website** points to `/`. Errors also offer **Get help with confirmation** at `/support`.

After the mobile team verifies the exact production opening URL on installed iOS/Android builds, set the constant to that approved URL and rebuild. A non-null value enables **Open Pins**, retains a manual-opening hint for desktop/uninstalled devices, and makes the website link secondary. Do not infer a route from the scheme or append incoming auth data. No automatic launch or session transfer occurs.

## Local previews and verification

Run `npm.cmd run dev` and open:

- Success: `http://localhost:3000/auth/confirmed`
- Expired fragment: `http://localhost:3000/auth/confirmed/#error=access_denied&error_code=otp_expired`
- Invalid query: `http://localhost:3000/auth/confirmed/?error_code=invalid_token`
- Generic: `http://localhost:3000/auth/confirmed/?error=server_error`
- Unknown parameters: `http://localhost:3000/auth/confirmed/?source=email&next=https%3A%2F%2Fexample.com`
- Escaped input: `http://localhost:3000/auth/confirmed/?error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E`

Errors are normalized in the address bar after reading them. Use synthetic placeholders for credential cleanup testing, never real tokens in screenshots/logs.

```sh
npm.cmd run lint
node --experimental-strip-types --test scripts/test-confirmation.mjs
npm.cmd run build
npx.cmd tsc --noEmit
git diff --check
git status --short
```

Focused tests need Node 22.6+ (Node 24 recommended). Review success/errors at 375, 390, 430, 768, and desktop widths; check keyboard focus, zoom, reduced motion, JS-disabled fallback, support/home links, and `/`, `/privacy`, `/support`, `/delete-account`.

### Historical implementation validation results (September 18, 2026)

- `npm.cmd run lint`: passed.
- `node --experimental-strip-types --test scripts/test-confirmation.mjs`: 5 tests passed (Node 24.16.0; informational module-type detection warning only).
- `npm.cmd run build`: passed on Next.js 16.3.5; confirmation and all existing pages exported statically.
- `npx.cmd tsc --noEmit`: passed.
- Local HTTP smoke checks: homepage, privacy, support, account deletion, and confirmation returned 200 with expected content. The no-slash confirmation route returned 308 with its error query preserved. Unknown and escaped malicious query requests returned 200 without executable query HTML.
- Export inspection: neutral prerender/no-JS guidance, canonical www URL, noindex/nofollow, no-referrer, and sitemap exclusion passed.
- `git diff --check`: passed. Changes are unstaged on `main`; no commit, push, or deployment was performed.
- Responsive CSS was inspected for the requested widths, but **rendered browser, keyboard interaction, hydration, and real-device checks remain unverified**: the browser tool reported no available browsers, and both Chrome and in-app-browser attempts were unavailable. Do not treat HTTP/parser tests as visual or end-to-end verification. Complete those checks and the production plan below before rollout.

## Production test plan (after a separately authorized deployment)

1. Check the deployed route/slash variant with synthetic query and fragment errors. Confirm no 404s, loops, or lost error states across apex → www and slash redirects. The normalized error code after hydration is intentional. Check `noindex`, `no-referrer`, and unchanged sitemap.
2. Complete the allowlist, mobile signup, and template review above. Sign up using a dedicated test email you control in the production mobile build, leaving real users untouched.
3. Tap a real confirmation email once on iPhone/Android browsers, using separate accounts/links where needed. Confirm the www destination and success screen. Return to Pins and sign in; inspect the test user's confirmed timestamp in Supabase to verify the server outcome. Merely visiting this page does not verify an email.
4. Reopen a consumed/expired link and verify the error state when Supabase returns `otp_expired`. Test generic failure with a synthetic URL. Check desktop and devices without Pins. If a template/provider keeps failures on its own page, investigate that upstream flow.
5. When Open Pins is configured, verify it opens the installed production app on both platforms without carrying credentials, and manual fallback/home links remain usable.
6. Recheck homepage, privacy, support, account deletion, keyboard focus, and mobile layouts. Avoid recording callback URLs with credentials. Deployment, Supabase/template/DNS changes, commits, and pushes are not part of this implementation.

## September 28 website sprint update

The current site uses self-hosted Inter and shared typography/control tokens. The no-error panel no longer declares “Email confirmed”; it explains the verification limitation. Skip-link anchors are preserved by cleanup and covered by a regression test. The full website browser suite now covers responsive layout, keyboard links, and confirmation hydration/errors; see [current audit results](website-trust-audit.md). Support email remains gated until the owner confirms a monitored mailbox. Earlier implementation limitations above describe the September 18 audit, not the current local test results. Live Supabase, production email and installed-device verification remain outstanding.
