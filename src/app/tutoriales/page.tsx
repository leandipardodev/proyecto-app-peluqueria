import type { Metadata } from "next";
import TutorialesClient from "@/components/tutoriales/tutoriales-client";

export const metadata: Metadata = {
  title: "Tutoriales",
  description:
    "Tutoriales en video de Klip: configurá tu negocio, agenda de turnos, señas online, cobros, clientes e inventario paso a paso.",
  alternates: { canonical: "/tutoriales" },
  openGraph: {
    title: "Tutoriales de Klip",
    description: "Videos cortos para configurar y aprovechar todo el sistema de Klip.",
    url: "/tutoriales",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Tutoriales Klip" }],
  },
};

export default function TutorialesPage() {
  return <TutorialesClient />;
}