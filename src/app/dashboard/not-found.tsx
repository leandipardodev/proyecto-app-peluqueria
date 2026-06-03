import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-black text-zinc-200 dark:text-zinc-800 select-none">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
        Página no encontrada
      </h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        La sección que buscás no existe o fue movida.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b7ff2] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al dashboard
      </Link>
    </div>
  );
}
