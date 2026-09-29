// The original README identifies this mailbox as a placeholder.
// Set to the monitored address only after the owner confirms it can receive requests.
export const supportEmail: string | null = null;
export const policyUpdated = "2026-09-28";
export const policyUpdatedLabel = "September 28, 2026";

export function emailHref(subject?: string) {
  if (!supportEmail) return null;
  return `mailto:${supportEmail}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}
