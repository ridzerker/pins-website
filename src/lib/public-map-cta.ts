// Every call to action on public maps, in one place, so wording and placement can be
// compared later without touching the page. Each CTA also carries data-cta with its placement.
// No tracking happens here or anywhere on the site (see docs/public-maps.md).
import { testFlightUrl } from "./site-config";

export type CtaPlacement = "profile" | "promo" | "unavailable" | "error";

export const publicMapCta = {
  // Before the App Store launch this is the public TestFlight invitation, never an internal one.
  href: testFlightUrl,
  getPins: "Get Pins",
  hint: "Free iPhone beta on TestFlight.",
  promoTitle: "Make a map of your own.",
  promoBody: "Pins is a social map. Save the places that matter, share them with friends, and publish a map like this one.",
  promoAction: "Create your map",
} as const;
