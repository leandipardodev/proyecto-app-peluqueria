import type { Metadata } from "next";

const landingFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Para que tipo de negocio sirve Klip?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Klip esta pensado para dueños de peluquerias y barberias que necesitan gestionar turnos, clientes, inventario y finanzas en un solo lugar.",
      },
    },
    {
      "@type": "Question",
      name: "Se puede cobrar seña online?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. Klip permite cobrar seña online con Mercado Pago para reducir ausencias y confirmar turnos con mayor seguridad.",
      },
    },
    {
      "@type": "Question",
      name: "Klip ayuda a ordenar la operacion diaria?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. Centraliza la agenda, la base de clientes, los servicios, el stock y los indicadores del negocio para que el dueño tome mejores decisiones.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "Software para dueños de peluquerias",
  description:
    "Klip ayuda a dueños de peluquerias y barberias a ordenar turnos, senas, clientes, stock y finanzas en un solo sistema.",
  alternates: {
    canonical: "/landing",
  },
  openGraph: {
    url: "/landing",
    title: "Klip | Software para dueños de peluquerias",
    description:
      "Ordena tu peluqueria con agenda inteligente, señas online, clientes, inventario y finanzas.",
    images: [
      {
        url: "/hero.png",
        width: 1200,
        height: 630,
        alt: "Klip para peluquerias y barberias",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Klip | Software para dueños de peluquerias",
    description: "Gestiona turnos, clientes e ingresos de tu peluqueria desde un solo lugar.",
    images: ["/hero.png"],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingFaqJsonLd) }}
      />
      {children}
    </>
  );
}
