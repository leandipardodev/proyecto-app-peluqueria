import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Software para psicologos",
  description: "Klip para psicologos: agenda de sesiones, pacientes, recordatorios y cobro de sena en una sola plataforma.",
  alternates: { canonical: "/psicologo" },
  openGraph: {
    title: "Klip para psicologos",
    description: "Ordena tu agenda de sesiones y el seguimiento de pacientes con una herramienta simple.",
    url: "/psicologo",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Klip para psicologos" }],
  },
};

export default function PsicologoLandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Software para psicologos</h1>
      <p className="mt-4 text-lg text-slate-600">Gestiona sesiones, pacientes y agenda semanal en una sola vista, sin planillas ni mensajes cruzados.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/register?rubro=psicologo" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Crear cuenta para psicologos
        </Link>
        <Link href="/landing" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver plataforma
        </Link>
      </div>
    </main>
  );
}
