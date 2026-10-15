import Image from "next/image";
import QRCode from "qrcode";
import { testFlightUrl } from "@/lib/site-config";

// Rendered at build time from testFlightUrl, so the code always matches the beta CTAs.
// Desktop only (see .beta-qr): scanning is pointless on the phone that shows it.
export async function TestFlightQr() {
  const svg = await QRCode.toString(testFlightUrl, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#2f6047", light: "#fffefa" } });
  return <figure className="beta-qr">
    <Image src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={104} height={104} alt="QR code that opens the Pins beta invitation in TestFlight" unoptimized />
    <figcaption>On a computer? Scan with your iPhone camera.</figcaption>
  </figure>;
}
