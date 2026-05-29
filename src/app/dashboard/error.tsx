"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
        Algo salió mal
      </h2>
      <p className="max-w-sm text-gray-600 dark:text-zinc-400">
        No se pudo cargar esta sección. Intentá de nuevo.
      </p>
      <button
        onClick={reset}
        className="inline-flex h-10 items-center justify-center rounded-2xl bg-violet-600 px-6 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-violet-700 active:scale-[0.98]"
      >
        Reintentar
      </button>
    </div>
  );
}
