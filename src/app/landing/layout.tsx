import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landing",
  description:
    "Conoce Klip: software para peluquerias y barberias con agenda, clientes, inventario y finanzas en una sola plataforma.",
  alternates: {
    canonical: "/landing",
  },
  openGraph: {
    url: "/landing",
    title: "Klip | Software para peluquerias y barberias",
    description:
      "Automatiza turnos, controla clientes y mejora tus ingresos con Klip.",
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
    title: "Klip | Software para peluquerias y barberias",
    description: "Automatiza turnos, clientes e ingresos con Klip.",
    images: ["/hero.png"],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
