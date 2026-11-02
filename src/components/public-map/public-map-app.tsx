"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "@/components/site";
import { Icon } from "@/components/icons";
import { displayNameFor, fetchPublicMap, publicMapConfig, publicMapPath, usernameFromPath, type PublicMap, type PublicMapPin, type PublicMapResult } from "@/lib/public-map";
import { testFlightUrl } from "@/lib/site-config";
import { MapCanvas } from "./map-canvas";
import styles from "./public-map.module.css";

const config = publicMapConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
const LIST_STEP = 60;
type View = PublicMapResult | { status: "loading" };

export function PublicMapApp() {
  const [view, setView] = useState<View>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const username = usernameFromPath(window.location.pathname);
    const controller = new AbortController();
    const load = async (): Promise<View> => username ? fetchPublicMap(username, config, fetch, controller.signal) : { status: "unavailable" };
    load().then(setView, () => {});
    return () => controller.abort();
  }, [attempt]);
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
      <ExternalLink className={`button ${failed ? styles.secondaryCta : `primary ${styles.cta}`}`} href={testFlightUrl}>Get Pins</ExternalLink>
      <Link href="/" className="text-link">What is Pins? →</Link>
    </div>
  </main>;
}

function MapPage({ map }: { map: PublicMap }) {
  const name = displayNameFor(map);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const pins = useMemo(() => category ? map.pins.filter(pin => pin.category.name === category) : map.pins, [map.pins, category]);
  const selected = pins.find(pin => pin.id === selectedId) ?? null;
  const chooseCategory = (next: string | null) => { setCategory(next); setSelectedId(null); setListed(LIST_STEP); };

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
        <ExternalLink className={`button primary ${styles.cta}`} href={testFlightUrl}>Get Pins <Icon name="arrow" size={16} /></ExternalLink>
        <p className={styles.ctaHint}>Already on Pins? Find @{map.username} in Explore.</p>
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
        <MapCanvas pins={pins} selectedId={selectedId} onSelect={setSelectedId} />
        <aside className={styles.panel} aria-live="polite">
          {selected ? <PinDetails pin={selected} onClose={() => setSelectedId(null)} /> : <>
            <h2 className={styles.panelTitle}>{category ?? "All pins"}</h2>
            <ul className={styles.list}>
              {pins.slice(0, listed).map(pin => <li key={pin.id}>
                <button type="button" className={styles.listItem} onClick={() => setSelectedId(pin.id)}>
                  <span className={styles.listIcon} style={{ ["--pin-color" as string]: pin.category.color ?? "#3F7D5A" }} aria-hidden="true">{pin.category.icon ?? ""}</span>
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
      <div><h2>Make a map of your own.</h2><p>Save the places that matter, share them with friends, and publish a map like this one.</p></div>
      <ExternalLink className={`button primary ${styles.cta}`} href={testFlightUrl}>Join the iOS beta <Icon name="arrow" size={16} /></ExternalLink>
    </section>
  </main>;
}

function PinDetails({ pin, onClose }: { pin: PublicMapPin; onClose: () => void }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${pin.latitude.toFixed(6)},${pin.longitude.toFixed(6)}`;
  return <article className={styles.details} aria-labelledby="pin-title">
    <button type="button" className={styles.back} onClick={onClose}>← All pins</button>
    <p className={styles.category}><span className={styles.listIcon} style={{ ["--pin-color" as string]: pin.category.color ?? "#3F7D5A" }} aria-hidden="true">{pin.category.icon ?? ""}</span>{pin.category.name}</p>
    <h2 id="pin-title">{pin.title}</h2>
    {pin.placeName && <p className={styles.place}><Icon name="pin" size={16} /> {pin.placeName}</p>}
    {pin.note && <p className={styles.note}>{pin.note}</p>}
    {pin.savedFrom && <p className={styles.attribution}>Saved from {pin.savedFrom.username
      // A full page load: /@username is a Vercel rewrite, not a Next.js route.
      ? <a href={publicMapPath(pin.savedFrom.username)}>{pin.savedFrom.displayName ?? `@${pin.savedFrom.username}`}</a>
      : "another Pins member"}</p>}
    <div className={styles.detailLinks}>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps<span className="visually-hidden"> (opens in a new tab)</span></a>
      {pin.linkUrl && <a href={pin.linkUrl} target="_blank" rel="noopener noreferrer nofollow ugc">Visit link<span className="visually-hidden"> (opens in a new tab)</span></a>}
    </div>
  </article>;
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
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
}
