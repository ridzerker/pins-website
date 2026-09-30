// Official, monitored Pins support mailbox. Used for support, privacy requests, and beta questions.
export const supportEmail = "support@joinpins.app";
export const policyUpdated = "2026-09-29";
export const policyUpdatedLabel = "September 29, 2026";

// encodeURIComponent (not URLSearchParams) so spaces become %20, which mail clients never show as "+".
export function emailHref(subject?: string, body?: string) {
  const params = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${supportEmail}${params ? `?${params}` : ""}`;
}

// Blank template only: never prefill user data. CRLF line breaks per RFC 6068.
export const privacyRequestBody = ["Hi Pins Support,", "", "I’m contacting you regarding a privacy/data request.", "", "Pins username or account email:", "Request:"].join("\r\n");
export const privacyRequestHref = emailHref("Privacy Request", privacyRequestBody);
export const betaAccessHref = emailHref("Beta Access", ["Hi Pins Support,", "", "I’m interested in beta access to Pins.", "", "Name:", "Email:"].join("\r\n"));
export const supportHref = emailHref("Pins Support", ["Hi Pins Support,", "", "I’m reaching out about:"].join("\r\n"));
