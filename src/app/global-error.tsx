"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="antialiased bg-gradient-to-br from-slate-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-black text-gray-900 dark:text-zinc-400">
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="relative">
            <div className="absolute -top-20 -left-20 h-60 w-60 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/15" />
            <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />
            <div className="relative z-10 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Error crítico
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                Ocurrió un error inesperado en la aplicación.
              </p>
              <button
                onClick={reset}
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 transition-colors"
              >
                Intentar de nuevo
              </button>
              <div className="mt-4 flex items-center justify-center gap-3">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/dashboard" className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                  Volver al inicio
                </a>
                <a href="/login" className="inline-flex items-center justify-center rounded-lg border border-red-300 px-6 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors">
                  Ir al login
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
