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
        text: "Klip esta pensado para duenos de peluquerias y barberias que necesitan gestionar turnos, clientes, inventario y finanzas en un solo lugar.",
      },
    },
    {
      "@type": "Question",
      name: "Se puede cobrar sena online?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. Klip permite cobrar sena online con Mercado Pago para reducir ausencias y confirmar turnos con mayor seguridad.",
      },
    },
    {
      "@type": "Question",
      name: "Klip ayuda a ordenar la operacion diaria?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Si. Centraliza la agenda, la base de clientes, los servicios, el stock y los indicadores del negocio para que el dueno tome mejores decisiones.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "Software para duenos de peluquerias",
  description:
    "Klip ayuda a duenos de peluquerias y barberias a ordenar turnos, senas, clientes, stock y finanzas en un solo sistema.",
  alternates: {
    canonical: "/landing",
  },
  openGraph: {
    url: "/landing",
    title: "Klip | Software para duenos de peluquerias",
    description:
      "Ordena tu peluqueria con agenda inteligente, senas online, clientes, inventario y finanzas.",
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
    title: "Klip | Software para duenos de peluquerias",
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
