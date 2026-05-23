import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sistema para barberias",
  description:
    "Sistema para barberias con agenda de turnos, senas online, control de clientes e indicadores para mejorar ingresos y organizacion.",
  alternates: { canonical: "/sistema-para-barberias" },
  openGraph: {
    title: "Sistema para barberias | Klip",
    description: "Gestion integral para barberias: agenda, clientes, servicios, cobros y seguimiento del negocio.",
    url: "/sistema-para-barberias",
    images: [{ url: "/hero.png", width: 1200, height: 630, alt: "Sistema para barberias Klip" }],
  },
};

export default function SistemaParaBarberiasPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-600">
        Gestion para barberias
      </p>
      <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl">Sistema para barberias</h1>
      <p className="mt-4 text-lg text-slate-600">
        Diseñado para duenos de barberias que quieren ordenar turnos, equipo, clientes y caja en un panel simple y accionable.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {[
          ["Turnos por barbero", "Control de horarios y disponibilidad por profesional."],
          ["Servicios y precios", "Catalogo claro para mostrar y vender mejor."],
          ["Clientes frecuentes", "Seguimiento de visitas y fidelizacion."],
          ["Indicadores del local", "Metrica de crecimiento, flujo y rendimiento."],
        ].map(([title, text]) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{text}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-xl font-semibold text-slate-900">Pensado para crecer sin desorden</h2>
        <p className="mt-2 text-sm text-slate-600">
          Klip te ayuda a profesionalizar tu barberia: menos caos operativo, mas control comercial y mejor experiencia para cada cliente.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/register" className="rounded-full bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0062c6]">
          Empezar ahora
        </Link>
        <Link href="/agenda-de-turnos-peluqueria" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver agenda
        </Link>
      </div>
    </main>
  );
}
