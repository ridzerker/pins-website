# Policy changes for public web maps

Status: **applied** to `src/app/privacy/page.tsx` and `src/app/cookies/page.tsx` on the feature
branch, and not published on the production site. Publish together with the feature (same deploy), and at that point
set `policyUpdated` / `policyUpdatedLabel` in `src/lib/site-config.ts` to the publish date. The owner
has not yet approved the wording. It has not had legal review.

Each item quotes the current text and gives the replacement.

## Privacy Policy (`/privacy`)

### 1. "Who can see what": opening sentence (currently untrue once maps exist)

Current:
> Pins content is available only inside the app to signed-in users; nothing is published as a public web page.

Replace with:
> Pins content is available inside the app to signed-in users. The one exception is a public web
> map, which you can choose to publish (see “Public web maps” below).

### 2. New subsection after “Pins”: “Public web maps”

> You can publish a web map at joinpins.app/@yourusername in the app under Settings, Privacy, Web Map. It is
> off until you turn it on, and only a public profile can have one. Anyone with the link can open it
> in a web browser without a Pins account.
>
> A web map shows your display name, username, bio, how many public pins you have, and, for each
> public pin, its title, category, note, place name, link, and exact location. A pin you saved from
> someone else names the original creator only if that person also publishes a web map. It never
> shows Only Me or Circle pins, your profile photo, followers, Circles, ratings, statuses, or the
> date you added a pin, though pins are listed newest first.
>
> Because the page works without signing in, blocking someone in Pins does not stop them from
> viewing your web map. Web map pages ask search engines not to index them, but anyone with the
> link can view, copy, or share what it shows, and we cannot recall copies other people make.
>
> Turning your web map off, making your profile private, deleting your account, or changing your
> username stops the page from showing your map the next time it loads. A page someone already has
> open keeps showing what it loaded until it refreshes. Making your profile private turns your web
> map off, and it stays off until you turn it on again. Changing a pin's audience or deleting it
> removes it from your web map, and so does the original creator making a pin you saved no longer public.

### 3. “Services we use”: Supabase and MapTiler bullets

Current:
> **Supabase**: sign-in, the Pins database, profile photo storage, and account deletion. …
> **MapTiler**: place search when Apple search is unavailable, and map display in some app versions.

Replace with:
> **Supabase**: sign-in, the Pins database, profile photo storage, account deletion, and the data
> shown on public web maps. …

Keep the MapTiler bullet as it is: the chosen base map is OpenFreeMap (founder's decision,
2026-11-05, Preview only so far). Add:
> **OpenFreeMap**: the background map on public web map pages, delivered through its content network,
> which may include Cloudflare. The map uses data from OpenStreetMap.
>
> **Google**: Sign in with Google, if you choose it, and Google Maps, if a visitor opens a web map pin there.

Only if a web-only MapTiler key is added later, change the MapTiler bullet to:
> **MapTiler**: place search when Apple search is unavailable, map display in some app versions,
> and the map on public web map pages.

### 4. “Your choices and privacy requests”: first sentence

Current:
> In the app you can make your profile private, choose the audience for each pin, edit or delete pins, block people, and delete your account.

Replace with:
> In the app you can make your profile private, publish or turn off a public web map, choose the
> audience for each pin, edit or delete pins, block people, and delete your account.

### 5. “This website” → “Browsing”: add after the first two sentences

Add (launch wording, OpenFreeMap):
> Public web map pages (joinpins.app/@username) are the exception to the website's static content:
> your browser asks the Pins database, hosted by Supabase, for that map's public data, and, to draw
> the map, loads map tiles, labels and icons from OpenFreeMap. These requests carry standard technical
> details such as your IP address and browser headers, and the tile requests show which part of the
> map you are viewing. They are sent without a Pins sign-in or cookies, and they do not include the
> address of the page you are viewing. If you choose "Open in Maps" or a pin's link, you leave Pins,
> and that site receives your request under its own policies.

If production ever launches without a base map, remove the OpenFreeMap wording here, in Services and
in Cookies.

## Cookies (`/cookies`): “What this website uses”

Current:
> App screens are static screenshots; there is no third-party map on the website.

Replace with (launch wording, OpenFreeMap):
> App screens are static screenshots. Public web map pages load that map's public data from the
> Pins database (Supabase), and map tiles, labels and icons from OpenFreeMap, which says it does not
> use cookies or tracking. These requests are made without cookies, and the page does not save
> anything in your browser's storage.

## Facts behind the wording (verified in code and tests on 2026-11-02)

- Off by default, public profiles only, forced off when private: migration `20261102000100`,
  `public-web-map-db-check.cjs`.
- Fields shown and not shown: the function's fixed output shape; e2e and DB tests.
- No sign-in, cookies or referrer on the data request; no browser storage: `fetchPublicMap`
  (`credentials: "omit"`, `referrerPolicy: "no-referrer"`), page `referrer` meta,
  `test-public-map-e2e.mjs`.
- `noindex`: page metadata and `vercel.json` `X-Robots-Tag` (header to be confirmed on the preview).
- No MapTiler at launch: no `NEXT_PUBLIC_MAPTILER_KEY` in any Vercel environment (verified
  2026-11-02); the map then uses the plain background and makes no tile requests (fixture e2e).
- Database side is live (migration 20261102000100 applied 2026-11-02) with every web map off.
- The quoted "Current" passages were re-checked against `src/app/privacy/page.tsx` and
  `src/app/cookies/page.tsx` on 2026-11-02. "Browsing" still says the site has no database "for
  collecting requests", which stays true (the map only reads).
- Blocking: anonymous visitors have no identity, so blocks cannot apply; signed-in blocked callers
  get nothing from the API, but the website never signs in.
