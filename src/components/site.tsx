import Image from "next/image";
import Link from "next/link";
import { Icon } from "./icons";
import { emailHref, policyUpdated, policyUpdatedLabel, supportEmail } from "@/lib/site-config";

export function Logo() {
  return <Link href="/" className="logo" aria-label="Pins home"><Image className="logo-mark" src="/brand/mark.svg" width={36} height={36} alt="" unoptimized />pins<span className="logo-period">.</span></Link>;
}

export function Header() {
  return <header className="site-header shell"><Logo /><nav aria-label="Main navigation"><Link href="/#features">Meet Pins</Link><Link href="/support">Support</Link><Link className="nav-cta" href="/#coming-soon">Coming soon <Icon name="arrow" size={16} /></Link></nav></header>;
}

export function Footer() {
  return <footer className="shell site-footer">
    <div className="footer-grid">
      <div className="footer-brand"><Logo /><p>A little more connected<br />to your world.</p></div>
      <nav aria-label="Product"><h2>Product</h2><Link href="/#features">Meet Pins</Link><Link href="/#coming-soon">Coming soon</Link></nav>
      <nav aria-label="Legal"><h2>Legal</h2><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><Link href="/data-request">Data Requests</Link></nav>
      <nav aria-label="Help"><h2>Contact</h2><Link href="/support">Support</Link><Link href="/delete-account">Account deletion</Link><a href={emailHref()}>Email Pins</a></nav>
    </div>
    <div className="footer-bottom"><p>Pins · joinpins.app</p><p>Save places. Share maps.</p></div>
  </footer>;
}

export function ContactDetails({ subject = "Pins support" }: { subject?: string }) {
  return <a href={emailHref(subject)}>{supportEmail}</a>;
}

export function DocumentPage({ label, title, intro, updated = false, contents, children }: {
  label: string; title: string; intro: string; updated?: boolean;
  contents?: { id: string; label: string }[]; children: React.ReactNode;
}) {
  return <main id="main-content" tabIndex={-1} className="document shell">
    <Link href="/" className="back-link">← Back to Pins</Link>
    <p className="eyebrow">{label}</p><h1>{title}</h1><p className="document-intro">{intro}</p>
    {updated && <p className="document-meta">Last updated <time dateTime={policyUpdated}>{policyUpdatedLabel}</time></p>}
    {contents && <nav className="document-toc" aria-label="On this page"><h2>On this page</h2><ul>{contents.map(item => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ul></nav>}
    <div className="document-body">{children}</div>
  </main>;
}
