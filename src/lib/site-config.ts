// Production host. joinpins.app redirects here (308), so canonical, sitemap, and social URLs use www.
export const siteUrl = "https://www.joinpins.app";
// Official, monitored Pins support mailbox. Used for support, privacy requests, and beta questions.
export const supportEmail = "support@joinpins.app";
export const policyUpdated = "2026-10-14";
export const policyUpdatedLabel = "October 14, 2026";

// Public TestFlight invitation for the iOS beta (verified October 14, 2026). This is not an App Store listing.
// Every download CTA and the desktop QR code read this value; change it only here.
export const testFlightUrl = "https://testflight.apple.com/join/MYXCR7bj";
// Apple's TestFlight app, which testers need before the invitation will open.
export const testFlightAppUrl = "https://apps.apple.com/app/testflight/id899247664";

// encodeURIComponent (not URLSearchParams) so spaces become %20, which mail clients never show as "+".
export function emailHref(subject?: string, body?: string) {
  const params = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${supportEmail}${params ? `?${params}` : ""}`;
}

// Blank template only: never prefill user data. CRLF line breaks per RFC 6068.
export const privacyRequestBody = ["Hi Pins Support,", "", "I’m contacting you regarding a privacy/data request.", "", "Pins username or account email:", "Request:"].join("\r\n");
export const privacyRequestHref = emailHref("Privacy Request", privacyRequestBody);
export const supportHref = emailHref("Pins Support", ["Hi Pins Support,", "", "I’m reaching out about:"].join("\r\n"));
