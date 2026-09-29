import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header, Footer } from "@/components/site";
import "./globals.css";
const inter = localFont({ src: "./fonts/InterVariable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
export const metadata: Metadata = {
  metadataBase: new URL("https://joinpins.app"),
  title: { default: "Pins — Save places. Share maps.", template: "%s | Pins" },
  description: "Pins is a social map for saving places, sharing private Circles, and discovering public maps from people you trust.",
  openGraph: { type: "website", siteName: "Pins", title: "Pins — Save places. Share maps.", description: "Your places. Your people. Your world. A social map, coming soon.", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pins — Save places. Share maps. Coming soon." }] },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={inter.variable}><body><a className="skip-link" href="#main-content">Skip to content</a><Header/>{children}<Footer/></body></html>; }
