import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/privacy", "/terms", "/cookies", "/data-request", "/support", "/delete-account"].map(path => ({ url: `https://joinpins.app${path}/` })); }
