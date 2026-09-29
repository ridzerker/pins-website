import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationState, cleanConfirmationUrl } from "../src/lib/confirmation.ts";

test("direct and verified arrivals succeed; unrelated parameters are ignored", () => {
  for (const [search, hash] of [["", ""], ["?utm_source=email&next=https://example.com", ""], ["", "#access_token=TEST_ONLY&refresh_token=TEST_ONLY&type=signup"]]) {
    assert.equal(confirmationState(search, hash), "success");
  }
});
test("expired/invalid failures work in query, fragment, and repeated/mixed parameters", () => {
  for (const [search, hash] of [
    ["?error_code=otp_expired", ""], ["", "#error=access_denied&error_code=otp_expired"],
    ["?error_code=invalid_token", "#access_token=TEST_ONLY"],
    ["?error_code=server_error&error_code=otp_expired", ""],
    ["?error_code=server_error", "#error_description=Email+link+is+invalid+or+has+expired"],
  ]) assert.equal(confirmationState(search, hash), "expired");
});
test("unknown, blank, hostile, and malformed error values safely fail", () => {
  for (const search of ["?error=server_error", "?error=", "?error_description=%3Cscript%3Ealert(1)%3C/script%3E", "?error_code=%E0%A4%A", "?error_description=unknown"]) {
    assert.equal(confirmationState(search, "#access_token=TEST_ONLY"), "error");
  }
  assert.equal(confirmationState("?unknown=%3Cscript%3E", ""), "success");
});
test("unverified callbacks and unrelated auth flows do not claim confirmation", () => {
  for (const search of ["?token_hash=TEST_ONLY&type=email", "?token=TEST_ONLY", "?code=TEST_ONLY", "?type=recovery", "?type=signup&type=recovery"]) {
    assert.equal(confirmationState(search, ""), "error");
  }
});
test("cleanup removes credentials/raw errors and preserves state across reloads", () => {
  for (const suffix of [
    "?utm_source=email#access_token=TEST_ONLY&refresh_token=TEST_ONLY&type=signup",
    "?token_hash=TEST_ONLY&type=email", "?error_description=%3Cscript%3E&code=TEST_ONLY",
    "?error_code=otp_expired#provider_token=TEST_ONLY&expires_at=123",
  ]) {
    const url = new URL(`https://www.joinpins.app/auth/confirmed/${suffix}`);
    const expected = confirmationState(url.search, url.hash);
    const clean = cleanConfirmationUrl(url);
    assert.ok(!/TEST_ONLY|script|token|expires_at/.test(clean));
    const after = new URL(clean, url.origin);
    assert.equal(confirmationState(after.search, after.hash), expected);
    assert.equal(cleanConfirmationUrl(after), clean);
  }
});

test("cleanup preserves document anchors used by keyboard skip navigation", () => {
  for (const suffix of ["#main-content", "?error_code=otp_expired#main-content", "#a%20section"]) {
    const url = new URL(`https://www.joinpins.app/auth/confirmed/${suffix}`);
    assert.equal(new URL(cleanConfirmationUrl(url), url.origin).hash, url.hash);
  }
});
