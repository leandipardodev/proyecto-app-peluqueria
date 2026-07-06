import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/peluqueria"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/psicologo"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/masajista"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/canchas"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/software-para-peluquerias"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/agenda-de-turnos-peluqueria"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/sistema-para-barberias"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/terminos"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/confirmacion"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  try {
    const admin = await createServiceRoleClient();
    const { data: shops } = await admin
      .from("shops")
      .select("slug, updated_at")
      .not("slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1000);

    for (const shop of shops || []) {
      const slug = (shop.slug || "").trim();
      if (!slug) continue;
      routes.push({
        url: absoluteUrl(`/book/${slug}`),
        lastModified: shop.updated_at ? new Date(shop.updated_at) : now,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  } catch {
    return routes;
  }

  return routes;
}
