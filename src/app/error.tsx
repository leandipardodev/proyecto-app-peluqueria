"use client";

import Link from "next/link";
import { logout } from "@/lib/dashboard/auth/logout-action";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-0 h-[800px] w-[800px] rounded-full bg-violet-300/20 blur-[150px] dark:bg-violet-500/15" />
        <div className="absolute top-1/2 -left-40 h-[900px] w-[900px] rounded-full bg-cyan-300/20 blur-[150px] dark:bg-cyan-500/15" />
        <div className="absolute -bottom-40 left-1/3 h-[800px] w-[800px] rounded-full bg-pink-300/20 blur-[150px] dark:bg-pink-500/15" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
          Algo salió mal
        </h1>
        <p className="max-w-md text-lg text-gray-600 dark:text-zinc-400">
          Ocurrió un error inesperado. Si el problema persiste, contactanos.
        </p>
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-violet-600 px-6 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-violet-700 active:scale-[0.98]"
        >
          Intentar de nuevo
        </button>
        <div className="flex gap-3">
          <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-300 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Volver al inicio
          </Link>
          <button
            onClick={async () => { await logout(); }}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-300 px-6 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
