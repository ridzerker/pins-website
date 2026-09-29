import type { Metadata } from "next";
import { pinsAppOpenUrl } from "@/lib/pins-app";
import { Confirmation } from "./confirmation";
import styles from "./confirmation.module.css";

export const metadata: Metadata = {
  title: "Email confirmation",
  description: "Your Pins email confirmation. Return to the app when you're ready.",
  alternates: { canonical: "https://www.joinpins.app/auth/confirmed/" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmedPage() {
  return (
    <main id="main-content" tabIndex={-1} className={`shell ${styles.main}`}>
      <section className={styles.surface} aria-label="Pins email confirmation">
        <p className={`eyebrow ${styles.eyebrow}`}>YOUR WORLD IS WAITING</p>
        <Confirmation appOpenUrl={pinsAppOpenUrl} />
        <noscript><p className={styles.noScript}>Enable JavaScript to view the result of your confirmation link, or return to Pins and try signing in.</p></noscript>
      </section>
    </main>
  );
}
