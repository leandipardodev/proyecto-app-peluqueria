import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Software para canchas",
  description: "Klip para canchas: gestion de turnos, jugadores y cobro de seña para reducir ausencias en canchas de futbol, padel y mas.",
  alternates: { canonical: "/canchas" },
  openGraph: {
    title: "Klip para canchas",
    description: "Administra turnos, canchas y jugadores con una plataforma simple y profesional.",
    url: "/canchas",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Klip para canchas" }],
  },
};

export default function CanchasLandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Software para canchas</h1>
      <p className="mt-4 text-lg text-slate-600">Gestiona tu agenda, reserva de canchas y cobro de seña con Klip. Ideal para canchas de futbol, padel, tenis y mas.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/register?rubro=canchas" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Crear cuenta para canchas
        </Link>
        <Link href="/" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver plataforma
        </Link>
      </div>
    </main>
  );
}
