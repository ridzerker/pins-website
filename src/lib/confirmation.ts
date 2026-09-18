export type ConfirmationState = "success" | "expired" | "error";

const errorKeys = ["error", "error_code", "error_description"];
const expiredCodes = new Set(["otp_expired", "otp_invalid", "token_expired", "invalid_token", "link_expired"]);
const sensitiveKeys = [
  "access_token", "refresh_token", "provider_token", "provider_refresh_token",
  "token", "token_hash", "code", "expires_at", "expires_in", "token_type",
];

export function confirmationState(search: string, hash: string): ConfirmationState {
  const sources = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ""))];
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
  return "success";
}

export function cleanConfirmationUrl(url: URL): string {
  const state = confirmationState(url.search, url.hash);
  const query = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.slice(1));
  for (const params of [query, fragment]) {
    for (const key of [...sensitiveKeys, ...errorKeys, "type"]) params.delete(key);
  }
  // Retain only a fixed error code so refresh/back preserves the state without raw errors.
  if (state !== "success") query.set("error_code", state === "expired" ? "otp_expired" : "confirmation_failed");
  const search = query.toString();
  const hash = fragment.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
