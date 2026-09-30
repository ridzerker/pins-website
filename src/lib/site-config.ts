// Official, monitored Pins support mailbox. Used for support, privacy requests, and beta questions.
export const supportEmail = "support@joinpins.app";
export const policyUpdated = "2026-09-29";
export const policyUpdatedLabel = "September 29, 2026";

export function emailHref(subject?: string) {
  return `mailto:${supportEmail}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}
