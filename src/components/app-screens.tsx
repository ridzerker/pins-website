import Image, { type StaticImageData } from "next/image";
import home from "@/assets/app/home.webp";

// Real Pins app screenshots. Derivatives in src/assets/app are cropped and resized only; never edit their UI.
// Static export has no image optimizer, so assets are pre-sized WebP served with `unoptimized`.
export function PhonePreview() {
  return <figure className="preview">
    <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
    <div className="phone"><Image className="phone-screen" src={home} alt="Pins Home screen on iPhone: a personal map covered in saved places, with a search bar, category filters, and an Add Pin button." loading="eager" fetchPriority="high" unoptimized /></div>
    <figcaption>Actual screenshot from the Pins iPhone app</figcaption>
  </figure>;
}

export function FeatureScreenshot({ src, alt }: { src: StaticImageData; alt: string }) {
  return <div className="feature-visual shot-visual"><div className="feature-shot"><Image src={src} alt={alt} unoptimized /></div></div>;
}
