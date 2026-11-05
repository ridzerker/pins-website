import type { Metadata } from "next";
import { PublicMapApp } from "@/components/public-map/public-map-app";
import styles from "@/components/public-map/public-map.module.css";

// One static shell serves every joinpins.app/@username link (vercel.json rewrites to /map/).
// It contains no user data: the map is fetched in the browser on every visit, so turning sharing
// off takes effect on the next load. Per-profile titles exist only after hydration, and the shell
// is never indexed (see docs/public-maps.md).
const SHARE_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: "Pins, a social map for saving places and sharing maps" };
export const metadata: Metadata = {
  title: "A map on Pins",
  description: "Explore places shared on Pins, a social map for saving places that matter.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  // Metadata here replaces the layout's whole openGraph object, so the shared image has to be repeated.
  openGraph: { type: "website", siteName: "Pins", title: "Explore this map on Pins", description: "Places worth saving, shared on Pins. Open the link to explore the map.", url: undefined, images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: "Explore this map on Pins", images: [SHARE_IMAGE.url] },
};

export default function PublicMapShell() {
  return <>
    <PublicMapApp />
    <noscript><p className={`shell ${styles.noScript}`}>Turn on JavaScript to explore this map.</p></noscript>
  </>;
}
