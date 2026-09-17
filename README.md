![pins.](public/brand/navbar.svg)

# Pins website

A warm, responsive public website for Pins at **joinpins.app**. Built with Next.js App Router, TypeScript, and Tailwind CSS. All routes are statically exported to `out/`; no database, authentication, external API, or environment variables are needed.

Installed versions: Next.js 16.3.5, React/React DOM 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3. Exact dependency resolutions are recorded in `package-lock.json`.

## Run locally

Use Node.js 22 or later (verified with Node 24).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

```sh
npm run lint
npm run build
```

The production build creates `out/`. Deploy it as static files; `next start` is not used with static export. See the [Next.js static export documentation](https://nextjs.org/docs/app/guides/static-exports).

## Project map

- `src/app/page.tsx`: landing page and exactly four feature blocks.
- `src/app/privacy/page.tsx`: beta privacy policy draft.
- `src/app/support/page.tsx`: help topics and email contact.
- `src/app/delete-account/page.tsx`: instructions for the in-app deletion flow.
- `src/app/layout.tsx`, `globals.css`: shared layout, metadata, responsive styling.
- `src/app/not-found.tsx`, `icon.svg`, `robots.ts`, `sitemap.ts`: 404, favicon, and SEO assets.
- `src/components/`: site navigation/footer, inline SVG icons, illustrative HTML/CSS/SVG phone preview.
- `public/og-image.png`: locally generated social sharing image.
- `scripts/create-og.ps1`: optional Windows script to regenerate the social card; not needed to build or deploy.
- Root configuration: Next.js static export, TypeScript, Tailwind/PostCSS, ESLint, package manifest and lockfile, Git ignore rules.
- `AGENTS.md` and `CLAUDE.md`: framework-generated guidance for future coding work.

No stock photography, remote fonts, analytics, third-party embeds, or extra UI libraries are used. The preview is illustrative and labeled accordingly. Its example place names, initials, and pin count are fictional UI content, not testimonials or user metrics. Controls inside that illustration are decorative.

## Push to GitHub manually

Git is initialized on `main`. No commit or push has been made. Create an empty GitHub repository, then run these commands yourself (replace `YOUR-USERNAME`):

```sh
git add .
git commit -m "Build Pins public website"
git remote add origin https://github.com/YOUR-USERNAME/pins-website.git
git push -u origin main
```

## Deploy to Vercel

1. Push to your GitHub repository.
2. In Vercel, choose **Add New → Project**, then import that repository.
3. Use the **Next.js** framework preset and the repository root. Build command: `npm run build`. Keep the detected output settings; the Next.js config enables static export.
4. Deploy. No environment variables are required.
5. Add `joinpins.app` in the project's domain settings and configure the DNS records Vercel supplies.
6. Verify all four routes, the mail links, favicon, and sharing image on your deployed domain.

## Before launch

- Set up and test **support@joinpins.app**. It is a placeholder contact address supplied in the brief. Email delivery is not provided by this project.
- “Get notified” opens a prefilled email to that address; there is no automatic subscription, stored waitlist, or guaranteed notification. The page explicitly explains the email action.
- Review the privacy draft against the actual app implementation, service providers, retention behavior, applicable age rules, and launch jurisdictions. It has not been reviewed by legal counsel. Update the date when the policy is approved.
- Confirm that profile visibility, follow requests, reporting/blocking options, location behavior, and **Profile → Settings → Delete Account** match the shipping app.
- Replace coming-soon links with the real TestFlight/App Store URLs when available. Do not label the app as available before then.
- Replace illustrative UI content or add real approved app screenshots later if desired.
- Check `joinpins.app` and metadata if the production domain changes.

Account deletion happens in the app; the website has no login or deletion form. Exact data deletion timelines are intentionally unspecified.
