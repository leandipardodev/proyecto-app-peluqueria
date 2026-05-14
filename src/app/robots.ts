import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/book/", "/confirmacion"],
        disallow: ["/dashboard", "/client", "/login", "/register", "/join", "/billing-required"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
