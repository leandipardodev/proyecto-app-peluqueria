import Link from "next/link";
import { ArrowLeft, Mail, TrendingUp } from "lucide-react";

export const dynamic = "force-static";

const SOPORTE_EMAIL = "soporte@klip.com.ar";

const mailtoHref = `mailto:${SOPORTE_EMAIL}?subject=${encodeURIComponent(
  "Quiero ser vendedor en Klip",
)}&body=${encodeURIComponent(
  "Hola, quiero ser vendedor en Klip.\n\n" +
    "Nombre:\n" +
    "Teléfono (con WhatsApp):\n" +
    "Zona donde trabajo:\n" +
    "Locales o peluquerías que conozco:\n\n" +
    "Gracias.",
)}`;

const BENEFITS = [
  {
    title: "Sin costo y sin exclusividad",
    detail: "No pagás nada para entrar y podés referenciar a otros además de Klip.",
  },
  {
    title: "Comisión por cada local",
    detail: "Cada peluquería o barbería que se registre por tu link te deja comisión.",
  },
  {
    title: "Tu propio panel",
    detail: " Ves en detalle qué locales trajiste y cuánto te corresponde cobrar.",
  },
];

export default function BecomeAPartnerPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        <div className="mt-6 rounded-[2.5rem] border border-white/10 bg-white/20 p-8 shadow-2xl shadow-black/[0.03] backdrop-blur-2xl dark:border-white/5 dark:border-t-white/20 dark:border-l-white/20 dark:bg-black/20">
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Programa de vendedores
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-zinc-100">
            Querés revender Klip? Unite al programa
          </h1>
          <p className="mt-2 text-base text-gray-600 dark:text-zinc-300">
            Si conocés peluquerías, barberías o centros de estética y querés sumar Klip a esos negocios, podés
            hacerlo y ganar por cada local que traigas.
          </p>

          <ul className="mt-7 space-y-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex gap-3">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                  aria-hidden="true"
                />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-zinc-100">{benefit.title}</span>
                  <span className="block text-sm text-gray-600 dark:text-zinc-300">{benefit.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <a
            href={mailtoHref}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Mail className="h-4 w-4" />
            Quiero ser vendedor
          </a>

          <p className="mt-3 text-center text-xs text-gray-500 dark:text-zinc-400">
            Te respondemos con tu código y tu PIN para entrar a tu panel.
          </p>
        </div>
      </div>
    </div>
  );
}
