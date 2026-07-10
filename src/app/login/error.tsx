"use client";

import Link from "next/link";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
          Algo sali&oacute; mal
        </h1>
        <p className="max-w-md text-lg text-gray-600 dark:text-zinc-400">
          No se pudo cargar la p&aacute;gina de inicio de sesi&oacute;n. Intent&aacute; de nuevo.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-400">Error ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-violet-600 px-6 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-violet-700 active:scale-[0.98]"
        >
          Reintentar
        </button>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-300 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
