// Sharing a public map, with no imports so the unit tests can load it directly in Node.
// Nothing is sent anywhere by the page itself: the browser's share sheet or clipboard does the work.

/** The canonical address of a map, or of one pin on it. Only valid usernames reach here. */
export function publicMapShareUrl(site: string, username: string, pinId?: string | null) {
  const url = `${site}/@${username}`;
  return pinId ? `${url}?pin=${encodeURIComponent(pinId)}` : url;
}
export function shareText(name: string) {
  return `Explore ${name}’s map on Pins`;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "manual";

/** The system share sheet where the browser has one, otherwise the clipboard. When neither works, the caller shows the link to copy by hand. */
export async function shareLink(data: { url: string; title: string; text: string }, nav: Pick<Navigator, "share" | "canShare" | "clipboard"> | undefined = typeof navigator === "undefined" ? undefined : navigator): Promise<ShareOutcome> {
  if (nav?.share && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (!nav?.clipboard?.writeText) return "manual";
    await nav.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "manual";
  }
}
