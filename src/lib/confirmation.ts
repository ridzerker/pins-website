// "confirmed": Supabase's verify endpoint redirected here with a signup session (only issued after
// the link verified). "neutral": no result to show (direct visit). The website never verifies itself.
export type ConfirmationState = "confirmed" | "neutral" | "expired" | "error";

const errorKeys = ["error", "error_code", "error_description"];
const expiredCodes = new Set(["otp_expired", "otp_invalid", "token_expired", "invalid_token", "link_expired"]);
const sensitiveKeys = [
  "access_token", "refresh_token", "provider_token", "provider_refresh_token",
  "token", "token_hash", "code", "expires_at", "expires_in", "token_type", "sb",
];
// Fixed, non-secret marker kept after cleanup so a reload of a verified arrival still shows success.
const confirmedKey = "status";
const confirmedValue = "confirmed";

export function confirmationState(search: string, hash: string): ConfirmationState {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const sources = [query, fragment];
  // Inspect both sources and every repeated value: an error always beats success.
  for (const params of sources) {
    const codes = [...params.getAll("error_code"), ...params.getAll("error")];
    if (codes.some(code => expiredCodes.has(code.toLowerCase())) ||
      params.getAll("error_description").some(description => /\b(expired|invalid (?:link|token)|(?:link|token) is invalid)\b/i.test(description))) {
      return "expired";
    }
  }
  if (sources.some(params => errorKeys.some(key => params.has(key)))) return "error";

  // This is a post-verification destination, not a token/PKCE callback or recovery page.
  if (sources.some(params => ["token", "token_hash", "code"].some(key => params.has(key)) ||
    params.getAll("type").some(type => type !== "signup"))) return "error";

  // Supabase's implicit-flow success redirect: #access_token=…&type=signup.
  if (fragment.has("access_token") && fragment.get("type") === "signup") return "confirmed";
  if (query.getAll(confirmedKey).includes(confirmedValue)) return "confirmed";
  return "neutral";
}

export function cleanConfirmationUrl(url: URL): string {
  const state = confirmationState(url.search, url.hash);
  const query = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const removedKeys = [...sensitiveKeys, ...errorKeys, "type"];
  // An ordinary document anchor must survive cleanup (including the skip link).
  const hasAuthFragment = removedKeys.some(key => fragment.has(key));
  for (const params of [query, fragment]) {
    for (const key of removedKeys) params.delete(key);
  }
  query.delete(confirmedKey);
  // Retain only a fixed state marker so refresh/back preserves the state without tokens or raw errors.
  if (state === "confirmed") query.set(confirmedKey, confirmedValue);
  if (state === "expired" || state === "error") query.set("error_code", state === "expired" ? "otp_expired" : "confirmation_failed");
  const search = query.toString();
  const hash = hasAuthFragment ? fragment.toString() : url.hash.slice(1);
  return `${url.pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
