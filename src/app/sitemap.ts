import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-config";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/privacy", "/terms", "/cookies", "/data-request", "/support", "/delete-account"].map(path => ({ url: `${siteUrl}${path}/` })); }
