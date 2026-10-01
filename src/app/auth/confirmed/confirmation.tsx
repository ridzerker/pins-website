"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { cleanConfirmationUrl, confirmationState } from "@/lib/confirmation";
import styles from "./confirmation.module.css";

function readState() {
  return confirmationState(window.location.search, window.location.hash);
}

function subscribe(onChange: () => void) {
  function sync() {
    const cleanUrl = cleanConfirmationUrl(new URL(window.location.href));
    if (cleanUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      // Preserve Next's history state. Never persist, forward, or log auth credentials.
      window.history.replaceState(window.history.state, "", cleanUrl);
    }
    onChange();
  }
  sync();
  window.addEventListener("hashchange", sync);
  window.addEventListener("popstate", sync);
  return () => {
    window.removeEventListener("hashchange", sync);
    window.removeEventListener("popstate", sync);
  };
}

const failedNext = "Already confirmed? Return to the Pins app and sign in. If not, contact support and we’ll help you get a new link.";
const copy: Record<"pending" | ReturnType<typeof readState>, { title: string; body: string; next?: string }> = {
  pending: { title: "Email confirmation", body: "Loading your confirmation result…" },
  confirmed: { title: "Email confirmed", body: "Your Pins account is ready.", next: "Return to the Pins app and sign in to continue." },
  neutral: { title: "Return to Pins", body: "Open the Pins app and sign in. If you haven’t confirmed your email yet, tap the link in your latest confirmation email." },
  expired: { title: "We couldn’t confirm your email", body: "This confirmation link may have expired or already been used.", next: failedNext },
  error: { title: "We couldn’t confirm your email", body: "This confirmation link couldn’t be completed.", next: failedNext },
};

export function Confirmation({ appOpenUrl }: { appOpenUrl: string | null }) {
  // A neutral prerender prevents a false success flash before fragment errors are read.
  const state = useSyncExternalStore(subscribe, readState, () => "pending" as const);
  const message = copy[state];
  const failed = state === "expired" || state === "error";
  const confirmed = state === "confirmed";

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.status}>
        <span className={`${styles.indicator} ${failed ? styles.errorIndicator : ""} ${confirmed ? styles.successIndicator : ""}`} aria-hidden="true">
          {failed ? <span className={styles.exclamation}>!</span> : <Icon name={confirmed ? "check" : "mail"} size={30} />}
        </span>
        <h1 className={styles.title}>{message.title}</h1>
        <p className={`${styles.copy} ${confirmed ? styles.lead : ""}`}>{message.body}</p>
        {message.next && <p className={styles.next}>{message.next}</p>}
      </div>
      <div className={styles.actions}>
        {appOpenUrl && (
          <>
            <a className={`button primary ${styles.primary}`} href={appOpenUrl} rel="noreferrer">Open Pins <Icon name="arrow" size={18} /></a>
            <p className={styles.hint}>If Pins doesn’t open, open the app on your device.</p>
          </>
        )}
        {failed && <Link href="/support" className={styles.support}>Get help with confirmation <Icon name="arrow" size={16} /></Link>}
        <Link href="/" className={appOpenUrl ? styles.home : `button primary ${styles.primary}`}>Back to Pins website{!appOpenUrl && <Icon name="arrow" size={18} />}</Link>
      </div>
    </>
  );
}
