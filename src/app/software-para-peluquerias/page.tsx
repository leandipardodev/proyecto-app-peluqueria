import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Software para peluquerias",
  description:
    "Klip es un software para peluquerias que centraliza turnos, senas, clientes, inventario y finanzas para duenos que quieren ordenar su negocio.",
  alternates: { canonical: "/software-para-peluquerias" },
  openGraph: {
    title: "Software para peluquerias | Klip",
    description: "Ordena la operacion diaria de tu peluqueria con agenda, clientes, stock y finanzas en una sola plataforma.",
    url: "/software-para-peluquerias",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Software para peluquerias Klip" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Software para peluquerias | Klip",
    description: "Gestion de turnos, clientes y finanzas para duenos de peluquerias.",
    images: ["/hero.png"],
  },
};

export default function SoftwareParaPeluqueriasPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-600">
        Solucion para duenos
      </p>
      <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Software para peluquerias</h1>
      <p className="mt-4 text-lg text-slate-600">
        Si llevas turnos por WhatsApp, stock en hojas sueltas y finanzas en varias apps, Klip unifica todo para que tomes decisiones claras y ganes
        tiempo de gestion.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {[
          ["Agenda inteligente", "Turnos online con disponibilidad real y menos ausencias."],
          ["Señas online", "Cobro de seña con Mercado Pago para confirmar reservas."],
          ["Clientes y fidelizacion", "Historial, notas y recompensas para aumentar recurrencia."],
          ["Finanzas claras", "Ingresos, egresos y rendimiento del local en un panel."],
        ].map(([title, text]) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{text}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-xl font-semibold text-slate-900">Para que tipo de peluqueria sirve?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Para peluquerias de barrio, barberias, estudios de color y negocios con uno o varios profesionales. Si sos dueno y queres ordenar la
          operacion diaria, Klip te da una base simple para crecer sin caos.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/register" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Probar Klip
        </Link>
        <Link href="/landing" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver mas detalles
        </Link>
      </div>
    </main>
  );
}
