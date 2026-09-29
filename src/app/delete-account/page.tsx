import type { Metadata } from "next";
import Link from "next/link";
import { DocumentPage } from "@/components/site";
export const metadata: Metadata = { title: "Account Deletion", description: "Account deletion guidance and the Pins privacy request contact route.", alternates: { canonical: "/delete-account/" } };
export default function DeleteAccount() { return <DocumentPage label="YOUR ACCOUNT, YOUR CHOICE" title="Delete your Pins account." intro="Review the in-app options and the privacy request route before taking a permanent action.">
  <section><h2>Find the deletion option</h2><div className="info-card"><strong>Profile → Settings → Delete Account</strong></div><p>This is the path described in the existing Pins app guidance. Availability and confirmation steps may vary by beta version. Review the confirmation screen in the app for what will be removed.</p></section>
  <section><h2>Before you confirm</h2><p>Account deletion is intended to be permanent. Save anything you want to keep, and check whether shared content or other information will be affected. Uninstalling Pins from your phone does not delete your account.</p><p>This website does not execute deletion, access your account, or confirm that deletion has completed. See <Link href="/privacy">Privacy</Link> for information handling and retention limitations.</p></section>
  <section><h2>Cannot access the option?</h2><p>Visit <Link href="/data-request">Data Requests</Link> for the current contact route and how to request account deletion or deletion of associated personal data. You can also ask for access or correction without requesting account deletion.</p></section>
</DocumentPage>; }
