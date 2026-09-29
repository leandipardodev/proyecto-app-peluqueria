import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agenda de turnos para peluqueria",
  description:
    "Agenda de turnos para peluqueria con confirmaciones, seña online y vista diaria por profesional. Menos ausencias y mejor organizacion.",
  alternates: { canonical: "/agenda-de-turnos-peluqueria" },
  openGraph: {
    title: "Agenda de turnos para peluqueria | Klip",
    description: "Organiza turnos por horario y profesional con una agenda pensada para peluquerias y barberias.",
    url: "/agenda-de-turnos-peluqueria",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Agenda de turnos peluqueria" }],
  },
};

export default function AgendaDeTurnosPeluqueriaPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="inline-flex rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-600 dark:text-slate-300">
        Agenda profesional
      </p>
      <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] text-slate-900 dark:text-slate-100 sm:text-5xl">Agenda de turnos para peluqueria</h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
        Klip te da una agenda clara para gestionar citas por dia, profesional y servicio. Ideal para dueños que necesitan orden sin perder tiempo.
      </p>

      <section className="mt-10 space-y-4">
        {[
          "Vista diaria y semanal de turnos por profesional.",
          "Reservas online con disponibilidad real para clientes.",
          "Recordatorios y seña online para bajar cancelaciones.",
          "Confirmacion final con datos completos del cliente.",
        ].map((item) => (
          <div key={item} className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 shadow-sm">
            {item}
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">Resultado en el dia a dia</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Menos huecos en agenda, menos tiempo en mensajes manuales y mejor control de la jornada. Tu equipo trabaja con una sola fuente de verdad.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/register" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Crear cuenta
        </Link>
        <Link href="/software-para-peluquerias" className="rounded-full border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-zinc-700">
          Ver solucion completa
        </Link>
      </div>
    </main>
  );
}
