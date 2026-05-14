import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { SITE_NAME } from "@/lib/seo";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BookLayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = await createServiceRoleClient();

  const { data: shop } = await adminClient
    .from("shops")
    .select("nombre")
    .eq("slug", slug)
    .maybeSingle();

  return {
    title: shop ? `${shop.nombre} | Reservar turno online` : "Reservar turno online",
    description: shop
      ? `Reserva tu turno online en ${shop.nombre}. Elegi servicio, profesional y horario en segundos.`
      : "Reserva tu turno online en segundos.",
    alternates: {
      canonical: `/book/${slug}`,
    },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url: `/book/${slug}`,
      title: shop ? `${shop.nombre} | Turnos online` : "Reservar turno online",
      description: shop
        ? `Agenda online de ${shop.nombre}. Reserva tu turno cuando quieras.`
        : "Reserva turnos online en segundos.",
      siteName: SITE_NAME,
      images: [
        {
          url: "/hero.png",
          width: 1200,
          height: 630,
          alt: shop ? `Turnos online en ${shop.nombre}` : "Turnos online con Klip",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shop ? `${shop.nombre} | Turnos online` : "Reservar turno online",
      description: shop
        ? `Reserva tu turno online en ${shop.nombre}.`
        : "Reserva tu turno online en segundos.",
      images: ["/hero.png"],
    },
  };
}

export default async function BookLayout({
  children,
}: BookLayoutProps) {
  return <>{children}</>;
}
