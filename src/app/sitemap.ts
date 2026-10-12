import type { MetadataRoute } from "next";
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
      url: absoluteUrl("/terminos"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/privacidad"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/tutoriales"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/vendedores/afiliarse"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Las páginas de reserva (`/book/[slug]`) no van al sitemap: son
  // transaccionales, se llega por link o QR, y en `layout.tsx` están en
  // noindex. Listarlas obligaba a Google a recrawlear hasta 1000 paginas
  // vacias por dia sin ningun resultado posible.
  return routes;
}
