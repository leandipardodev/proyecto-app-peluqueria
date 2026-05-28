import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Software para masajistas",
  description: "Klip para masajistas: agenda de sesiones, control de clientes y cobro de seña para reducir ausencias.",
  alternates: { canonical: "/masajista" },
  openGraph: {
    title: "Klip para masajistas",
    description: "Administra turnos, sesiones y clientes con una plataforma simple y profesional.",
    url: "/masajista",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Klip para masajistas" }],
  },
};

export default function MasajistaLandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Software para masajistas</h1>
      <p className="mt-4 text-lg text-slate-600">Gestiona tu agenda, confirma sesiones con seña y mejora tu organizacion diaria con Klip.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/register?rubro=masajista" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Crear cuenta para masajistas
        </Link>
        <Link href="/landing" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver plataforma
        </Link>
      </div>
    </main>
  );
}
