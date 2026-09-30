import type { Metadata } from "next";
import Link from "next/link";
import { ContactDetails, DocumentPage } from "@/components/site";
export const metadata: Metadata = { title: "Support", description: "Help with Pins, email confirmation, sharing, and privacy requests.", alternates: { canonical: "/support/" } };
export default function Support() { return <DocumentPage label="PINS SUPPORT" title="Need help with Pins?" intro="Start with the guidance below for account, app, and privacy questions.">
  <div className="info-card"><p><strong>Contact Pins</strong></p><p><ContactDetails /></p><p>Send a short description of your question. For technical problems, your device and app version can help. Never send passwords, confirmation links, or sign-in codes. Sending a question does not subscribe you to marketing.</p></div>
  <section><h2>Login or confirmation email issues</h2><p>Check the email address you entered and your spam or junk folder. Use the link in your latest confirmation email, then return to the app to try signing in. The website’s confirmation page cannot check your account status or resend an email.</p></section>
  <section><h2>Maps, profiles, and sharing</h2><p>Check the audience shown in the app before sharing a Pin, map, or profile. Public content can be copied by others. If you report a sharing issue, describe what you expected and what happened; avoid including private locations or other people’s details unless necessary.</p></section>
  <section><h2>Reporting a concern</h2><p>If your app version offers reporting or blocking controls, you can use them there. For help from support, describe the issue and include only the information needed to investigate.</p></section>
  <section><h2>Privacy and account deletion</h2><p>Visit <Link href="/data-request">Data Requests</Link> for deletion, access, correction, or another privacy question. Existing in-app steps are described in <Link href="/delete-account">account deletion guidance</Link>.</p></section>
  <section><h2>Beta availability</h2><p>Pins is preparing for beta testing. Downloads and invitations are not offered on this website yet. Check the <Link href="/#coming-soon">coming-soon section</Link> for the current status.</p></section>
</DocumentPage>; }
