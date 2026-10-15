import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header, Footer } from "@/components/site";
import { siteUrl } from "@/lib/site-config";
import "./globals.css";
const inter = localFont({ src: "./fonts/InterVariable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Pins — Save places. Share maps.", template: "%s | Pins" },
  description: "Pins is a social map for saving places that matter, sharing them with private Circles, and discovering public maps. Try the public iOS beta on TestFlight.",
  openGraph: { type: "website", siteName: "Pins", title: "Pins — Save places. Share maps.", description: "A social map for the places that matter to you, shared with the people you choose. Now in public beta on iPhone through TestFlight.", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pins: Save places. Share maps. Discover your world. Public beta for iPhone on TestFlight." }] },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={inter.variable}><body><a className="skip-link" href="#main-content">Skip to content</a><Header/>{children}<Footer/></body></html>; }
