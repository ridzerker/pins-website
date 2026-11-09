"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "@/components/site";
import { Icon } from "@/components/icons";
import { displayNameFor, fetchPublicMap, pinIdFromSearch, publicMapConfig, publicMapPath, usernameFromPath, type PublicMap, type PublicMapPin, type PublicMapResult } from "@/lib/public-map";
import { CLUSTER_ABOVE_PINS, pinAppearance } from "@/lib/pins-marker";
import { publicMapCta } from "@/lib/public-map-cta";
import { publicMapShareUrl, placeShareText, shareLink, shareText } from "@/lib/public-map-share";
import { siteUrl } from "@/lib/site-config";
import { MapCanvas } from "./map-canvas";
import styles from "./public-map.module.css";

const config = publicMapConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
const LIST_STEP = 60;
// A tab left open keeps showing old data otherwise. Checking only on return keeps requests rare.
const RECHECK_AFTER_MS = 60_000;
type View = PublicMapResult | { status: "loading" };

export function PublicMapApp() {
  const [view, setView] = useState<View>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadedAt = useRef(0);

  useEffect(() => {
    const username = usernameFromPath(window.location.pathname);
    const controller = new AbortController();
    const load = async (): Promise<View> => username ? fetchPublicMap(username, config, fetch, controller.signal) : { status: "unavailable" };
    load().then(result => { if (!controller.signal.aborted) { loadedAt.current = Date.now(); setView(result); } }, () => {});
    return () => controller.abort();
  }, [attempt]);

  // Coming back to an open map: a revoked map or deleted pin disappears, a failed check changes nothing.
  useEffect(() => {
    const username = usernameFromPath(window.location.pathname);
    if (view.status !== "ready" || !username) return;
    let controller: AbortController | null = null;
    const recheck = () => {
      if (document.visibilityState !== "visible" || controller || Date.now() - loadedAt.current < RECHECK_AFTER_MS) return;
      const current = new AbortController();
      controller = current;
      fetchPublicMap(username, config, fetch, current.signal).then(result => {
        controller = null;
        loadedAt.current = Date.now();
        if (result.status === "error" || result.status === "not-configured") return;
        // Same data keeps the same object, so the camera and any open details stay put.
        setView(previous => result.status === "ready" && JSON.stringify(result) === JSON.stringify(previous) ? previous : result);
      }, () => { controller = null; });
    };
    // pageshow covers Back and Forward, which can restore this page from the browser's memory as it was.
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("focus", recheck);
      controller?.abort();
    };
  }, [view.status]);
  const retry = () => { setView({ status: "loading" }); setAttempt(n => n + 1); };

  useDocumentTitle(view.status === "loading" ? null : view.status === "ready" ? `${displayNameFor(view.map)} (@${view.map.username}) | Pins` : "Map not available | Pins");

  if (view.status === "loading") return <main id="main-content" tabIndex={-1} className={`shell ${styles.page}`}><p className={styles.loading} role="status">Loading map…</p></main>;
  if (view.status === "ready") return <MapPage map={view.map} />;
  const failed = view.status === "error";
  return <main id="main-content" tabIndex={-1} className={`document shell ${styles.message}`}>
    <p className="eyebrow">{failed ? "SOMETHING WENT WRONG" : "A LITTLE OFF THE MAP"}</p>
    <h1>{failed ? "We couldn’t load this map." : "This map isn’t available."}</h1>
    <p className="document-intro">{failed ? "Check your connection and try again." : "The link may be wrong, or its owner may have stopped sharing their map on the web."}</p>
    <div className={styles.messageActions}>
      {failed && <button type="button" className={`button primary ${styles.cta}`} onClick={retry}>Try again</button>}
      <ExternalLink className={`button ${failed ? styles.secondaryCta : `primary ${styles.cta}`}`} href={publicMapCta.href} cta={failed ? "error" : "unavailable"}>{publicMapCta.getPins}</ExternalLink>
      <Link href="/" className="text-link">What is Pins? →</Link>
    </div>
  </main>;
}

function MapPage({ map }: { map: PublicMap }) {
  const name = displayNameFor(map);
  const [chosenCategory, setCategory] = useState<string | null>(null);
  // A shared link opens on its pin. The id is only compared with this map's own pins, never sent anywhere.
  const [selectedId, setSelectedId] = useState<string | null>(() => pinIdFromSearch(window.location.search));
  const [listed, setListed] = useState(LIST_STEP);
  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; icon: string | null; count: number }>();
    for (const pin of map.pins) {
      const entry = counts.get(pin.category.name) ?? { name: pin.category.name, icon: pin.category.icon, count: 0 };
      entry.count++;
      counts.set(pin.category.name, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [map.pins]);
  // A category can vanish when a return to the tab brings fresher data.
  const category = categories.some(item => item.name === chosenCategory) ? chosenCategory : null;
  const pins = useMemo(() => category ? map.pins.filter(pin => pin.category.name === category) : map.pins, [map.pins, category]);
  const selected = pins.find(pin => pin.id === selectedId) ?? null;
  const clustered = map.pins.length > CLUSTER_ABOVE_PINS;
  const panel = useRef<HTMLElement>(null);
  const returnFocusTo = useRef<string | null>(null);
  const chooseCategory = (next: string | null) => { setCategory(next); setSelectedId(null); setListed(LIST_STEP); };
  const closeDetails = () => { returnFocusTo.current = selectedId; setSelectedId(null); };
  // The list item that opened the details is gone from the page, so focus has to be placed by hand.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
    const pinId = returnFocusTo.current;
    if (selectedId || !pinId) return;
    returnFocusTo.current = null;
    const items = panel.current?.querySelectorAll<HTMLElement>("[data-pin-id]") ?? [];
    (Array.from(items).find(item => item.dataset.pinId === pinId) ?? panel.current?.querySelector<HTMLElement>("h2"))?.focus();
  }, [selectedId]);

  return <main id="main-content" tabIndex={-1} className={styles.page}>
    <section className={`shell ${styles.profile}`} aria-labelledby="profile-name">
      <div className={styles.avatar} aria-hidden="true">{initials(name)}</div>
      <div className={styles.identity}>
        <h1 id="profile-name">{name}</h1>
        <p className={styles.handle}>@{map.username}</p>
        {map.bio && <p className={styles.bio}>{map.bio}</p>}
        <p className={styles.count}><Icon name="pin" size={16} /> {map.publicPinCount.toLocaleString("en-US")} public {map.publicPinCount === 1 ? "pin" : "pins"}</p>
      </div>
      <div className={styles.profileActions}>
        <div className={styles.actionRow}>
          <ExternalLink className={`button primary ${styles.cta}`} href={publicMapCta.href} cta="profile">{publicMapCta.getPins} <Icon name="arrow" size={16} /></ExternalLink>
          <ShareButton className={`button ${styles.secondaryCta}`} label="Share map" url={publicMapShareUrl(siteUrl, map.username)} title={`${name} on Pins`} text={shareText(name)} />
        </div>
        <p className={styles.ctaHint}>{publicMapCta.hint} Already on Pins? Find @{map.username} in Explore.</p>
      </div>
    </section>

    {map.pins.length === 0 ? <section className={`shell ${styles.empty}`}>
      <h2>No public pins yet</h2>
      <p>When {name} shares a public pin, it will show up here.</p>
    </section> : <>
      {categories.length > 1 && <nav className={`shell ${styles.filters}`} aria-label="Filter by category">
        <button type="button" className={styles.chip} aria-pressed={category === null} onClick={() => chooseCategory(null)}>All <span>{map.pins.length.toLocaleString("en-US")}</span></button>
        {categories.map(item => <button key={item.name} type="button" className={styles.chip} aria-pressed={category === item.name} onClick={() => chooseCategory(item.name)}>
          {item.icon && <span aria-hidden="true">{item.icon}</span>} {item.name} <span>{item.count.toLocaleString("en-US")}</span>
        </button>)}
      </nav>}
      <section className={`shell ${styles.workspace}`} aria-label={`${name}’s map`}>
        <MapCanvas key={clustered ? "clustered" : "plain"} pins={pins} clustered={clustered} selectedId={selectedId} onSelect={setSelectedId} />
        <aside ref={panel} className={styles.panel} onKeyDown={event => { if (event.key === "Escape" && selected) closeDetails(); }}>
          {selected ? <PinDetails pin={selected} owner={map.username} ownerName={name} onClose={closeDetails} /> : <>
            <h2 className={styles.panelTitle} tabIndex={-1}>{category ?? "All pins"}</h2>
            <p className="visually-hidden" role="status">{category ? `Showing ${pins.length.toLocaleString("en-US")} ${pins.length === 1 ? "pin" : "pins"} in ${category}` : ""}</p>
            <ul className={styles.list}>
              {pins.slice(0, listed).map(pin => <li key={pin.id}>
                <button type="button" className={styles.listItem} data-pin-id={pin.id} onClick={() => setSelectedId(pin.id)}>
                  <CategoryIcon category={pin.category} />
                  <span className={styles.listText}><strong>{pin.title}</strong>{pin.placeName && <small>{pin.placeName}</small>}</span>
                </button>
              </li>)}
            </ul>
            {pins.length > listed && <button type="button" className={styles.more} onClick={() => setListed(n => n + LIST_STEP)}>Show more ({(pins.length - listed).toLocaleString("en-US")} left)</button>}
            {map.truncated && <p className={styles.truncated}>Showing the newest {map.pins.length.toLocaleString("en-US")} of {map.publicPinCount.toLocaleString("en-US")} public pins.</p>}
          </>}
        </aside>
      </section>
    </>}

    <section className={`shell ${styles.promo}`}>
      <div><h2>{publicMapCta.promoTitle}</h2><p>{publicMapCta.promoBody}</p></div>
      <div className={styles.promoAction}>
        <ExternalLink className={`button primary ${styles.cta}`} href={publicMapCta.href} cta="promo">{publicMapCta.promoAction} <Icon name="arrow" size={16} /></ExternalLink>
        <p className={styles.ctaHint}>{publicMapCta.hint}</p>
      </div>
    </section>
  </main>;
}

function PinDetails({ pin, owner, ownerName, onClose }: { pin: PublicMapPin; owner: string; ownerName: string; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  // On a phone the details sit below the map, so a marker tap would otherwise show no change.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.closest("article")?.scrollIntoView({ block: "nearest" });
  }, [pin.id]);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${pin.latitude.toFixed(6)},${pin.longitude.toFixed(6)}`;
  return <article className={styles.details} aria-labelledby="pin-title">
    <button type="button" className={styles.back} onClick={onClose}>← All pins</button>
    <p className={styles.category}><CategoryIcon category={pin.category} />{pin.category.name}</p>
    <h2 id="pin-title" ref={title} tabIndex={-1}>{pin.title}</h2>
    {pin.placeName && <p className={styles.place}><Icon name="pin" size={16} /> {pin.placeName}</p>}
    {pin.note && <p className={styles.note}>{pin.note}</p>}
    {pin.savedFrom && <p className={styles.attribution}>Saved from {pin.savedFrom.username
      // A full page load: /@username is a Vercel rewrite, not a Next.js route.
      ? <a href={publicMapPath(pin.savedFrom.username)}>{pin.savedFrom.displayName ?? `@${pin.savedFrom.username}`}</a>
      : "another Pins member"}</p>}
    <div className={styles.detailLinks}>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps<span className="visually-hidden"> (opens in a new tab)</span></a>
      {pin.linkUrl && <a href={pin.linkUrl} target="_blank" rel="noopener noreferrer nofollow ugc">Visit link<span className="visually-hidden"> (opens in a new tab)</span></a>}
      <ShareButton className={styles.linkButton} label="Share place" url={publicMapShareUrl(siteUrl, owner, pin.id)} title={`${pin.title} on Pins`} text={placeShareText(pin.title, ownerName)} />
    </div>
  </article>;
}

/** Share sheet where the browser has one, else the clipboard, else the link to copy by hand. */
function ShareButton({ url, title, text, label, className }: { url: string; title: string; text: string; label: string; className: string }) {
  const [status, setStatus] = useState<"" | "copied" | "manual">("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (status === "manual") field.current?.select();
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus(""), 4000);
    return () => clearTimeout(timer);
  }, [status]);
  const share = async () => {
    setStatus("");
    const outcome = await shareLink({ url, title, text });
    if (outcome === "copied" || outcome === "manual") setStatus(outcome);
  };
  return <span className={styles.share}>
    <button type="button" className={className} onClick={() => { void share(); }}><Icon name="share" size={16} /> {label}</button>
    <span role="status" className={styles.shareStatus}>{status === "copied" ? "Link copied" : ""}</span>
    {status === "manual" && <label className={styles.manual}>Copy this link<input ref={field} readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>}
  </span>;
}

function CategoryIcon({ category }: { category: PublicMapPin["category"] }) {
  const { color, symbol } = pinAppearance(category);
  return <span className={styles.listIcon} style={{ ["--pin-color" as string]: color }} aria-hidden="true">{symbol}</span>;
}

function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const apply = () => { if (document.title !== title) document.title = title; };
    apply();
    // Next.js streams the shell's metadata after hydration; keep this map's title when it lands.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

function initials(name: string) {
  const words = name.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  // By character, not UTF-16 unit, so a name starting with an emoji stays whole.
  const first = Array.from(words[0]);
  return (words.length > 1 ? first[0] + Array.from(words[words.length - 1])[0] : first.slice(0, 2).join("")).toUpperCase();
}
