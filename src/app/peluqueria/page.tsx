import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Software para peluquerias",
  description: "Klip para peluquerias: agenda de turnos, señas online, clientes, inventario y finanzas en un solo sistema.",
  alternates: { canonical: "/peluqueria" },
  openGraph: {
    title: "Klip para peluquerias",
    description: "Ordena tu peluqueria con agenda inteligente y control total de la operacion.",
    url: "/peluqueria",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Klip para peluquerias" }],
  },
};

export default function PeluqueriaLandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Software para peluquerias</h1>
      <p className="mt-4 text-lg text-slate-600">Centraliza agenda, seña online, clientes e inventario para gestionar tu local sin caos.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/register?rubro=peluqueria" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Crear cuenta para peluqueria
        </Link>
        <Link href="/landing" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver plataforma
        </Link>
      </div>
    </main>
  );
}
