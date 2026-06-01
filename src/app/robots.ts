import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/book/", "/confirmacion", "/terminos"],
        disallow: [
          "/dashboard",
          "/client",
          "/login",
          "/register",
          "/join",
          "/billing-required",
          "/api/",
          "/auth/",
          "/onboarding/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
