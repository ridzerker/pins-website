import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/privacy", "/support", "/delete-account"].map(path => ({ url: `https://joinpins.app${path}/` })); }
