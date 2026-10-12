import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

type PreviewService = { name: string; price: number | null; hide_price: boolean };

/**
 * Texto del preview social. El link de un local se comparte por WhatsApp e
 * Instagram, no por busqueda: el preview es la unica surfaced que ve el
 * cliente. Por eso el texto lleva ciudad y servicios con precio -- que es lo
 * que decide si alguien completa la reserva -- y no una frase generica.
 */
function buildPreviewDescription(
  nombre: string,
  localidad: string | null,
  description: string | null,
  services: PreviewService[]
): string {
  // La descripción del local casi siempre ya viene cerrada en punto, así que se
  // normaliza antes de encadenar: si no, "Reserva tu turno online en X." + " en
  // Chivilcoy." salía como "... en X. en Chivilcoy.".
  const base = (description?.trim() || `Reserva tu turno online en ${nombre}`).replace(
    /[.\s]+$/,
    ""
  );
  const cityPart = localidad?.trim() ? ` en ${localidad.trim()}.` : ".";

  const highlights = services
    .filter((s) => s.name?.trim() && !s.hide_price)
    .slice(0, 2)
    .map((s) => {
      const price =
        typeof s.price === "number" && s.price > 0
          ? ` desde $${s.price.toLocaleString("es-AR")}`
          : "";
      return `${s.name.trim()}${price}`;
    });

  const highlightPart = highlights.length ? ` Reservá ${highlights.join(" o ")}.` : "";

  return `${base}${cityPart}${highlightPart} Agenda online con Klip.`;
}

export async function generateMetadata({
  params,
}: BookLayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = await createServiceRoleClient();

  const { data: shop } = await adminClient
    .from("shops")
    .select("id, nombre, description, localidad")
    .eq("slug", slug)
    .maybeSingle();

  const services: PreviewService[] = shop
    ? (
        await adminClient
          .from("services")
          .select("name, price, hide_price")
          .eq("shop_id", shop.id)
          .order("name", { ascending: true })
          .limit(4)
      ).data ?? []
    : [];

  const title = shop ? `${shop.nombre} | Reservar turno online` : "Reservar turno online";
  const description = shop
    ? buildPreviewDescription(shop.nombre, shop.localidad ?? null, shop.description ?? null, services)
    : "Reserva tu turno online en segundos.";

  // El preview es del local, no de Klip: el link se comparte por WhatsApp e
  // Instagram, y cada preview con el hero de Klip le sacaba la viralidad al
  // negocio que la compartía. `twitter` sin `images` cae a `og:image`.
  const previewUrl = absoluteUrl(`/book/${slug}/og`);

  return {
    title,
    description,
    // Las reservas son transaccionales y se llegan por link o QR, no por
    // busqueda: indexarlas no trae trafico y sí expone el dominio al patrón de
    // "scaled content abuse" (miles de páginas con el mismo template y distinto
    // contenido). `follow` queda activo a propósito para que el link "powered
    // by" de cada local siga pasando autoridad a la home.
    robots: { index: false, follow: true },
    alternates: {
      canonical: `/book/${slug}`,
    },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url: `/book/${slug}`,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: previewUrl,
          width: 1200,
          height: 630,
          alt: shop ? `Turnos online en ${shop.nombre}` : "Turnos online con Klip",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BookLayout({
  children,
}: BookLayoutProps) {
  return <>{children}</>;
}
